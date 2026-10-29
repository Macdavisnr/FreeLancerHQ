import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { optionalUserId } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { publicInvoiceUrl } from '../invoiceEmail.js'
import { getConnection, PAYSTACK_CURRENCIES, paystack, PaystackError, recordOnlinePayment, toSubunit, type PaystackTransaction } from '../paystack.js'
import { checkRateLimit } from '../rateLimit.js'
import { notifyInvoiceViewed } from '../notifications.js'
import { getBusiness } from '../settings.js'
import { PAID_JOIN, STATUS_SQL, toDate } from '../sql.js'

/*
 * Routes anyone can call, WITHOUT logging in. Everything here must assume the caller is a
 * stranger: return only what the page needs (no internal ids, no other invoices, nothing
 * about the freelancer's account beyond their business details).
 */
export const publicRouter = Router()

// Tokens are 43 URL-safe characters. Rejecting anything else early saves a database query.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** A sent invoice by its public token, or a 404 that reveals nothing. */
async function loadPublicInvoice(token: string) {
  if (!TOKEN_PATTERN.test(token)) throw new HttpError(404, 'This invoice link is not valid.')
  const { rows } = await pool.query(
    `SELECT i.id, i.user_id, i.prefix || lpad(i.number::text, 3, '0') AS reference,
            c.name AS "clientName", c.email AS "clientEmail", c.company AS "clientCompany", c.address AS "clientAddress",
            ${toDate('i.issue_date', 'issueDate')}, ${toDate('i.due_date', 'dueDate')},
            i.currency, i.tax_rate::float8 AS "taxRate", i.subtotal::float8 AS subtotal, i.tax::float8 AS tax,
            i.total::float8 AS total, COALESCE(pay.paid, 0)::float8 AS paid,
            (i.total - COALESCE(pay.paid, 0))::float8 AS balance, i.notes, ${STATUS_SQL} AS status
     FROM invoices i JOIN clients c ON c.id = i.client_id ${PAID_JOIN}
     WHERE i.public_token = $1 AND i.sent_at IS NOT NULL`,
    [token],
  )
  // Same answer for "no such token" and "not sent": a stranger learns nothing either way.
  if (!rows[0]) throw new HttpError(404, 'This invoice link is not valid.')
  const { id: invoiceId, user_id: ownerId, ...invoice } = rows[0]
  return { invoiceId: invoiceId as string, ownerId: ownerId as string, invoice }
}

// GET /api/public/invoices/:token  -> one sent invoice, as the client sees it
publicRouter.get('/invoices/:token', async (req, res) => {
  const { invoiceId, ownerId, invoice } = await loadPublicInvoice(req.params.token)

  const items = await pool.query(
    `SELECT description, quantity::float8 AS quantity, unit_price::float8 AS "unitPrice",
            (quantity * unit_price)::float8 AS amount
     FROM invoice_items WHERE invoice_id = $1 ORDER BY position`,
    [invoiceId],
  )

  // The first visit by someone other than the owner counts as "viewed by client".
  if (optionalUserId(req) !== ownerId) {
    const first = await pool.query('UPDATE invoices SET viewed_at = now() WHERE id = $1 AND viewed_at IS NULL', [invoiceId])
    if (first.rowCount) await notifyInvoiceViewed(invoiceId).catch((err) => console.error('View notification failed:', err))
  }

  res.set({
    'Cache-Control': 'private, no-store', // payments change the balance: never show a stale copy
    'X-Robots-Tag': 'noindex', // keep invoice links out of search engines
  })
  // Show the Pay button only when it can actually work.
  const connection = await getConnection(ownerId)
  const payOnline = Boolean(connection) && invoice.balance > 0 && PAYSTACK_CURRENCIES.has(invoice.currency)
  res.json({
    invoice,
    items: items.rows,
    business: await getBusiness(ownerId),
    payOnline,
    // 'test' lets the page warn that no real money moves (Paystack test keys).
    paymentMode: payOnline ? connection!.mode : null,
  })
})

// POST /api/public/invoices/:token/pay  -> start a Paystack checkout, returns the URL to send the client to
publicRouter.post('/invoices/:token/pay', async (req, res) => {
  const token = req.params.token
  // Each click creates a Paystack transaction: cap it so nobody can spam the freelancer's account.
  checkRateLimit(`pay:${token}`, 10, 10 * 60_000, 'payment attempts')
  const { invoiceId, ownerId, invoice } = await loadPublicInvoice(token)
  if (invoice.balance <= 0) throw new HttpError(409, 'This invoice is already paid.')
  const connection = await getConnection(ownerId)
  if (!connection || !PAYSTACK_CURRENCIES.has(invoice.currency)) throw new HttpError(409, 'Online payment is not available for this invoice.')

  // OUR reference, so we can recognise this payment when Paystack reports back.
  const reference = `fhq_${randomBytes(12).toString('hex')}`
  // Write it down BEFORE going to Paystack (see checkout_sessions in schema.sql).
  await pool.query(
    'INSERT INTO checkout_sessions (reference, user_id, invoice_id, amount, currency) VALUES ($1, $2, $3, $4, $5)',
    [reference, ownerId, invoiceId, invoice.balance, invoice.currency],
  )

  try {
    const data = await paystack<{ authorization_url: string }>(connection.secretKey, 'POST', '/transaction/initialize', {
      email: invoice.clientEmail, // Paystack requires one: it sends the client their receipt
      amount: toSubunit(invoice.balance),
      currency: invoice.currency,
      reference,
      // Paystack sends the client back here, adding ?reference=... to the URL.
      callback_url: publicInvoiceUrl(token),
      metadata: { invoice: invoice.reference, cancel_action: publicInvoiceUrl(token) },
    })
    res.json({ authorizationUrl: data.authorization_url })
  } catch (err) {
    await pool.query(`UPDATE checkout_sessions SET status = 'failed' WHERE reference = $1`, [reference])
    console.error('Paystack initialize failed:', err)
    throw new HttpError(502, err instanceof PaystackError && err.status === 400 ? `Paystack: ${err.message}` : 'Could not start the payment. Please try again.')
  }
})

// POST /api/public/invoices/:token/verify  body: { reference }
// The client is back from Paystack. We do NOT trust the URL saying it worked: we ask Paystack.
publicRouter.post('/invoices/:token/verify', async (req, res) => {
  const { reference } = z.object({ reference: z.string().trim().regex(/^fhq_[0-9a-f]{24}$/, 'Invalid payment reference.') }).parse(req.body)
  const { invoiceId, ownerId } = await loadPublicInvoice(req.params.token)
  // The reference must belong to THIS invoice.
  const { rowCount } = await pool.query('SELECT 1 FROM checkout_sessions WHERE reference = $1 AND invoice_id = $2', [reference, invoiceId])
  if (!rowCount) throw new HttpError(404, 'Payment not found.')
  const connection = await getConnection(ownerId)
  if (!connection) throw new HttpError(409, 'Online payment is not available for this invoice.')

  let tx: PaystackTransaction
  try {
    tx = await paystack<PaystackTransaction>(connection.secretKey, 'GET', `/transaction/verify/${encodeURIComponent(reference)}`)
  } catch {
    throw new HttpError(502, 'Could not confirm the payment with Paystack yet. Refresh in a moment.')
  }
  const result = await recordOnlinePayment(tx)
  res.json({ result: result === 'already_paid' ? 'paid' : result })
})
