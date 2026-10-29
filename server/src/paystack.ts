import { decrypt } from './crypto.js'
import { pool } from './db.js'
import { getRate } from './rates.js'
import { getSettings } from './settings.js'
import { round2 } from './sql.js'

/*
 * Everything that talks to Paystack lives here. Paystack's API is plain HTTPS + JSON:
 * every request carries "Authorization: Bearer <secret key>", and every answer looks like
 * { status: true/false, message: "...", data: {...} }.
 */

const API_BASE = (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, '')

/** Currencies a Paystack account can charge in. USD only works once Paystack has enabled it for you. */
export const PAYSTACK_CURRENCIES = new Set(['NGN', 'GHS', 'ZAR', 'KES', 'USD'])

/** Paystack counts money in the smallest unit (kobo, pesewas, cents): ₦1 = 100. */
export const toSubunit = (amount: number) => Math.round(amount * 100)

export class PaystackError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function paystack<T>(secretKey: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000), // never leave the client's page hanging on Paystack
    })
  } catch {
    throw new PaystackError(0, 'Could not reach Paystack.')
  }
  const json = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T }
  if (!response.ok || !json.status) throw new PaystackError(response.status, json.message ?? 'Paystack returned an error.')
  return json.data as T
}

/** The user's connected Paystack account, with the secret key decrypted. null if not connected. */
export async function getConnection(userId: string) {
  const { rows } = await pool.query(
    'SELECT secret_key_enc, key_last4, mode, connected_at FROM payment_connections WHERE user_id = $1',
    [userId],
  )
  if (!rows[0]) return null
  return {
    secretKey: decrypt(rows[0].secret_key_enc),
    last4: rows[0].key_last4 as string,
    mode: rows[0].mode as 'test' | 'live',
    connectedAt: rows[0].connected_at as string,
  }
}

/** The fields we use from a Paystack transaction (same shape in "verify" and in webhooks). */
export interface PaystackTransaction {
  reference: string
  status: string // 'success' | 'failed' | 'abandoned' | 'ongoing' | ...
  amount: number // subunit
  currency: string
  channel?: string // 'card' | 'bank' | 'bank_transfer' | 'ussd' | ...
  paid_at?: string | null
}

export type RecordResult = 'paid' | 'already_paid' | 'pending' | 'failed' | 'unknown' | 'mismatch'

/**
 * Turn a successful Paystack transaction into a payment on the invoice: EXACTLY ONCE.
 *
 * This is called from two places that can race each other: the client returning to the invoice
 * page, and Paystack's webhook. Two things make a double payment impossible:
 *   1. SELECT ... FOR UPDATE locks the checkout row, so the second caller waits for the first.
 *   2. payments.provider_reference is UNIQUE, so the database itself refuses a duplicate.
 * That property, "doing it twice has the same effect as doing it once", is called IDEMPOTENCY.
 */
export async function recordOnlinePayment(tx: PaystackTransaction): Promise<RecordResult> {
  const { rows } = await pool.query(
    `SELECT s.reference, s.user_id, s.invoice_id, s.amount::float8 AS amount, s.currency, s.status
     FROM checkout_sessions s WHERE s.reference = $1`,
    [tx.reference],
  )
  const session = rows[0]
  if (!session) return 'unknown' // not a checkout we started
  if (session.status === 'paid') return 'already_paid'

  if (tx.status !== 'success') {
    if (tx.status === 'failed') {
      await pool.query(`UPDATE checkout_sessions SET status = 'failed' WHERE reference = $1 AND status = 'pending'`, [tx.reference])
      return 'failed'
    }
    return 'pending' // abandoned / ongoing: the client may still finish
  }

  // Paystack must confirm exactly what we asked for. Anything else is logged and NOT recorded.
  if (tx.currency !== session.currency || tx.amount !== toSubunit(session.amount)) {
    console.error(`Paystack amount mismatch for ${tx.reference}: expected ${toSubunit(session.amount)} ${session.currency}, got ${tx.amount} ${tx.currency}`)
    return 'mismatch'
  }

  // Same home-currency rule as manual payments (worked out before the transaction: it may need the network).
  const amount = round2(session.amount)
  const { currency: home } = await getSettings(session.user_id)
  let exchangeRate = 1
  if (session.currency !== home) exchangeRate = (await getRate(session.currency, home)).rate
  const baseAmount = round2(amount * exchangeRate)
  const method = `Paystack${tx.channel ? ` · ${tx.channel.replace('_', ' ')}` : ''}`

  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const locked = await db.query('SELECT status FROM checkout_sessions WHERE reference = $1 FOR UPDATE', [tx.reference])
    if (locked.rows[0].status === 'paid') {
      await db.query('COMMIT')
      return 'already_paid'
    }
    await db.query(
      `INSERT INTO payments (user_id, invoice_id, amount, base_amount, exchange_rate, paid_on, method, note, provider_reference)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now())::date, $7, $8, $9)
       ON CONFLICT (provider_reference) DO NOTHING`,
      [session.user_id, session.invoice_id, amount, baseAmount, exchangeRate, tx.paid_at ?? null, method, `Online payment, ref ${tx.reference}`, tx.reference],
    )
    await db.query(`UPDATE checkout_sessions SET status = 'paid', paid_at = now() WHERE reference = $1`, [tx.reference])
    await db.query('COMMIT')
    return 'paid'
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    db.release()
  }
}
