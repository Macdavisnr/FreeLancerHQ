import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { encrypt } from '../crypto.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { appUrl } from '../invoiceEmail.js'
import { getConnection, paystack, PaystackError, recordOnlinePayment, type PaystackTransaction } from '../paystack.js'

export const paystackSettingsRouter = Router()
paystackSettingsRouter.use(requireAuth)

/** Where each freelancer must tell Paystack to send webhooks (Paystack dashboard → Settings → API Keys & Webhooks). */
const webhookUrl = () => `${(process.env.API_URL || appUrl()).replace(/\/$/, '')}/api/webhooks/paystack`

// GET /api/settings/paystack  -> is Paystack connected? (never returns the key itself)
paystackSettingsRouter.get('/', async (req, res) => {
  const connection = await getConnection(req.userId)
  res.json({
    connected: Boolean(connection),
    mode: connection?.mode ?? null,
    last4: connection?.last4 ?? null,
    connectedAt: connection?.connectedAt ?? null,
    webhookUrl: webhookUrl(),
  })
})

// PUT /api/settings/paystack  body: { secretKey }  -> check it with Paystack, then store it encrypted
paystackSettingsRouter.put('/', async (req, res) => {
  const { secretKey } = z
    .object({
      secretKey: z
        .string()
        .trim()
        .regex(/^sk_(test|live)_[A-Za-z0-9]{10,}$/, 'That does not look like a Paystack secret key. It starts with sk_test_ or sk_live_.'),
    })
    .parse(req.body)

  // Prove the key works before saving it: list (at most) one transaction. A wrong key gets a 401.
  try {
    await paystack(secretKey, 'GET', '/transaction?perPage=1')
  } catch (err) {
    if (err instanceof PaystackError && err.status === 401) throw new HttpError(400, 'Paystack rejected this key. Copy it again from your Paystack dashboard.')
    throw new HttpError(502, 'Could not reach Paystack to check the key. Please try again.')
  }

  const mode = secretKey.startsWith('sk_live_') ? 'live' : 'test'
  await pool.query(
    `INSERT INTO payment_connections (user_id, secret_key_enc, key_last4, mode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET secret_key_enc = EXCLUDED.secret_key_enc, key_last4 = EXCLUDED.key_last4, mode = EXCLUDED.mode, connected_at = now()`,
    [req.userId, encrypt(secretKey), secretKey.slice(-4), mode],
  )
  res.json({ connected: true, mode, last4: secretKey.slice(-4), connectedAt: new Date().toISOString(), webhookUrl: webhookUrl() })
})

// DELETE /api/settings/paystack  -> disconnect (clients just stop seeing the Pay button)
paystackSettingsRouter.delete('/', async (req, res) => {
  await pool.query('DELETE FROM payment_connections WHERE user_id = $1', [req.userId])
  res.status(204).end()
})

/*
 * POST /api/webhooks/paystack  - called by PAYSTACK's servers, not by a browser.
 *
 * Anyone on the internet could POST "charge.success" here, so we only believe it if it carries
 * a valid signature: Paystack sends x-paystack-signature = HMAC-SHA512(raw body, secret key).
 * Only Paystack and the freelancer know that key, so only they can produce a matching signature.
 *
 * The HMAC must be computed over the EXACT bytes Paystack sent. That's why this route is mounted
 * with express.raw() (in index.ts) BEFORE express.json(): parsing and re-encoding the JSON
 * could change spacing and break the signature.
 *
 * Several freelancers share this one URL, each signing with their own key. So we first read
 * the (still untrusted) reference to find out whose checkout it is, fetch THAT freelancer's
 * key, and only then check the signature.
 */
export const paystackWebhook: RequestHandler = async (req, res) => {
  const raw = req.body as Buffer
  const signature = req.header('x-paystack-signature') ?? ''
  let event: { event?: string; data?: PaystackTransaction }
  try {
    event = JSON.parse(raw.toString('utf8'))
  } catch {
    res.status(400).end()
    return
  }

  const reference = event.data?.reference
  const { rows } = reference
    ? await pool.query('SELECT user_id FROM checkout_sessions WHERE reference = $1', [reference])
    : { rows: [] }
  // Not one of our checkouts (e.g. another app on the same Paystack account): acknowledge and ignore,
  // otherwise Paystack keeps retrying.
  if (!rows[0]) {
    res.sendStatus(200)
    return
  }
  const connection = await getConnection(rows[0].user_id)
  if (!connection) {
    res.sendStatus(200)
    return
  }

  const expected = createHmac('sha512', connection.secretKey).update(raw).digest('hex')
  const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!valid) {
    console.warn(`Rejected Paystack webhook with a bad signature (ref ${reference}).`)
    res.sendStatus(401)
    return
  }

  if (event.event === 'charge.success' && event.data) {
    const result = await recordOnlinePayment(event.data)
    console.log(`Paystack webhook charge.success ${reference}: ${result}`)
  }
  res.sendStatus(200) // answer quickly: Paystack retries webhooks that aren't acknowledged
}
