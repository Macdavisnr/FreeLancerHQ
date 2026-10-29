import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { currencyCode } from '../currencies.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { defaultInvoiceMessage, invoiceEmail, publicInvoiceUrl } from '../invoiceEmail.js'
import { sendEmail } from '../notify.js'
import { getRate } from '../rates.js'
import { getBusiness, getSettings } from '../settings.js'
import { PAID_JOIN, STATUS_SQL, round2, toDate } from '../sql.js'

export const invoicesRouter = Router()
export const paymentsRouter = Router()

invoicesRouter.use(requireAuth)
paymentsRouter.use(requireAuth)

const INVOICE_SELECT = `
  SELECT i.id, i.number, i.prefix || lpad(i.number::text, 3, '0') AS reference, i.client_id AS "clientId", c.name AS "clientName", c.email AS "clientEmail",
         i.project_id AS "projectId", pr.name AS "projectName",
         ${toDate('i.issue_date', 'issueDate')}, ${toDate('i.due_date', 'dueDate')},
         i.tax_rate::float8 AS "taxRate", i.subtotal::float8 AS subtotal, i.tax::float8 AS tax,
         i.total::float8 AS total, COALESCE(pay.paid, 0)::float8 AS paid,
         (i.total - COALESCE(pay.paid, 0))::float8 AS balance,
         i.currency, i.base_rate::float8 AS "baseRate",
         (i.total * i.base_rate)::float8 AS "totalBase",
         ((i.total - COALESCE(pay.paid, 0)) * i.base_rate)::float8 AS "balanceBase",
         i.notes, i.sent_at AS "sentAt", i.created_at AS "createdAt",
         i.public_token AS "publicToken", i.last_emailed_at AS "lastEmailedAt", i.viewed_at AS "viewedAt",
         ${STATUS_SQL} AS status
  FROM invoices i
  JOIN clients c ON c.id = i.client_id
  LEFT JOIN projects pr ON pr.id = i.project_id
  ${PAID_JOIN}`

const PAYMENT_COLUMNS = `p.id, p.invoice_id AS "invoiceId", p.amount::float8 AS amount,
  p.base_amount::float8 AS "baseAmount", p.exchange_rate::float8 AS "exchangeRate",
  ${toDate('p.paid_on', 'paidOn')}, p.method, p.note, p.created_at AS "createdAt"`

const dateString = z.iso.date('Enter a valid date.')

const invoiceSchema = z.object({
  clientId: z.uuid('Choose a client.'),
  projectId: z.union([z.uuid(), z.literal('')]).nullish().transform((v) => v || null),
  issueDate: dateString,
  dueDate: dateString,
  taxRate: z.coerce.number('Tax rate must be a number.').min(0).max(100, 'Tax rate cannot exceed 100%.').default(0),
  /** The currency this invoice is billed in. Defaults to the account's home currency. */
  currency: currencyCode.optional(),
  notes: z.string().trim().default(''),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Every line needs a description.'),
        quantity: z.coerce.number('Quantity must be a number.').positive('Quantity must be more than 0.'),
        unitPrice: z.coerce.number('Rate must be a number.').min(0, 'Rate cannot be negative.'),
      }),
    )
    .min(1, 'Add at least one line item.'),
})

const paymentSchema = z.object({
  /** In the INVOICE's currency. */
  amount: z.coerce.number('Amount must be a number.').positive('Amount must be more than 0.'),
  /** Optional: what actually landed in the account, in the home currency (overrides the market rate). */
  baseAmount: z.coerce.number('Received amount must be a number.').positive('Received amount must be more than 0.').optional(),
  paidOn: dateString,
  method: z.string().trim().default(''),
  note: z.string().trim().default(''),
})

const id = (value: unknown) => z.uuid('Invalid id.').parse(value)

type InvoiceInput = z.infer<typeof invoiceSchema>

/** The server, not the browser, decides the totals. */
function calculateTotals(input: InvoiceInput) {
  const subtotal = round2(input.items.reduce((sum, it) => sum + round2(it.quantity * it.unitPrice), 0))
  const tax = round2((subtotal * input.taxRate) / 100)
  return { subtotal, tax, total: round2(subtotal + tax) }
}

async function assertValidRelations(input: InvoiceInput, userId: string) {
  if (input.dueDate < input.issueDate) throw new HttpError(400, 'Due date cannot be before the issue date.')
  const client = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND user_id = $2', [input.clientId, userId])
  if (!client.rowCount) throw new HttpError(400, 'Choose one of your clients.')
  if (input.projectId) {
    const project = await pool.query(
      'SELECT 1 FROM projects WHERE id = $1 AND user_id = $2 AND client_id = $3',
      [input.projectId, userId, input.clientId],
    )
    if (!project.rowCount) throw new HttpError(400, 'That project does not belong to this client.')
  }
}

/** Replace all of an invoice's lines in one statement (unnest turns arrays into rows). */
async function writeItems(db: PoolClient, invoiceId: string, items: InvoiceInput['items']) {
  await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId])
  await db.query(
    `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, position)
     SELECT $1, t.d, t.q, t.p, t.ord - 1
     FROM unnest($2::text[], $3::numeric[], $4::numeric[]) WITH ORDINALITY AS t(d, q, p, ord)`,
    [invoiceId, items.map((i) => i.description), items.map((i) => i.quantity), items.map((i) => i.unitPrice)],
  )
}

async function loadInvoice(invoiceId: string, userId: string) {
  const { rows } = await pool.query(`${INVOICE_SELECT} WHERE i.id = $1 AND i.user_id = $2`, [invoiceId, userId])
  if (!rows[0]) throw new HttpError(404, 'Invoice not found.')
  return rows[0]
}

async function loadDetail(invoiceId: string, userId: string) {
  const invoice = await loadInvoice(invoiceId, userId)
  const items = await pool.query(
    `SELECT id, description, quantity::float8 AS quantity, unit_price::float8 AS "unitPrice",
            (quantity * unit_price)::float8 AS amount
     FROM invoice_items WHERE invoice_id = $1 ORDER BY position`,
    [invoiceId],
  )
  const payments = await pool.query(
    `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.invoice_id = $1 AND p.user_id = $2 ORDER BY p.paid_on, p.created_at`,
    [invoiceId, userId],
  )
  return { invoice, items: items.rows, payments: payments.rows, business: await getBusiness(userId) }
}

// GET /api/invoices  (?clientId= / ?projectId= to filter)  -> invoices + headline numbers
invoicesRouter.get('/', async (req, res) => {
  const params: unknown[] = [req.userId]
  let where = 'WHERE i.user_id = $1'
  for (const [query, column] of [['clientId', 'i.client_id'], ['projectId', 'i.project_id']] as const) {
    const value = req.query[query]
    if (typeof value === 'string') {
      params.push(id(value))
      where += ` AND ${column} = $${params.length}`
    }
  }
  const { rows } = await pool.query(`${INVOICE_SELECT} ${where} ORDER BY i.number DESC`, params)

  // Headline numbers are always in the account's home currency.
  const sum = (list: { balanceBase: number }[]) => round2(list.reduce((s, r) => s + r.balanceBase, 0))
  const unpaid = rows.filter((r) => r.status === 'sent' || r.status === 'overdue')
  const overdue = rows.filter((r) => r.status === 'overdue')

  const paid = await pool.query(
    `SELECT COALESCE(SUM(base_amount), 0)::float8 AS total FROM payments
     WHERE user_id = $1 AND date_trunc('month', paid_on) = date_trunc('month', CURRENT_DATE)`,
    [req.userId],
  )
  res.json({
    invoices: rows,
    summary: {
      paidThisMonth: paid.rows[0].total,
      outstanding: sum(unpaid),
      outstandingCount: unpaid.length,
      overdue: sum(overdue),
      overdueCount: overdue.length,
    },
  })
})

// GET /api/invoices/:id  -> invoice + line items + payments
invoicesRouter.get('/:id', async (req, res) => {
  res.json(await loadDetail(id(req.params.id), req.userId))
})

// POST /api/invoices
invoicesRouter.post('/', async (req, res) => {
  const input = invoiceSchema.parse(req.body)
  await assertValidRelations(input, req.userId)
  const totals = calculateTotals(input)
  const { invoicePrefix, currency: homeCurrency } = await getSettings(req.userId)
  const currency = input.currency ?? homeCurrency
  // 1 invoice-currency = baseRate home-currency, saved on the invoice (see schema.sql).
  const baseRate = (await getRate(currency, homeCurrency)).rate

  const db = await pool.connect()
  try {
    await db.query('BEGIN') // a transaction: everything below succeeds together or not at all
    // Lock per user so two simultaneous requests can't be given the same invoice number.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.userId])
    const { rows } = await db.query(
      `INSERT INTO invoices (user_id, client_id, project_id, number, prefix, issue_date, due_date, tax_rate, subtotal, tax, total, notes, currency, base_rate)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(number), 0) + 1 FROM invoices WHERE user_id = $1),
               $11, $4, $5, $6, $7, $8, $9, $10, $12, $13)
       RETURNING id`,
      [req.userId, input.clientId, input.projectId, input.issueDate, input.dueDate, input.taxRate,
       totals.subtotal, totals.tax, totals.total, input.notes, invoicePrefix, currency, baseRate],
    )
    await writeItems(db, rows[0].id, input.items)
    await db.query('COMMIT')
    res.status(201).json(await loadDetail(rows[0].id, req.userId))
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    db.release()
  }
})

// PUT /api/invoices/:id
invoicesRouter.put('/:id', async (req, res) => {
  const invoiceId = id(req.params.id)
  const input = invoiceSchema.parse(req.body)
  await assertValidRelations(input, req.userId)
  const totals = calculateTotals(input)

  // A draft gets a fresh rate every time it is saved; once sent, currency and rate are frozen.
  // (Network call first, outside the transaction.)
  const existing = await loadInvoice(invoiceId, req.userId)
  const { currency: homeCurrency } = await getSettings(req.userId)
  const wantedCurrency = input.currency ?? existing.currency
  const draftRate = existing.sentAt ? null : (await getRate(wantedCurrency, homeCurrency)).rate

  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    // FOR UPDATE locks this invoice row until COMMIT so a payment can't sneak in mid-edit.
    const current = await db.query(
      `SELECT sent_at, currency, base_rate::float8 AS "baseRate",
              COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0)::float8 AS paid
       FROM invoices i WHERE i.id = $1 AND i.user_id = $2 FOR UPDATE`,
      [invoiceId, req.userId],
    )
    const row = current.rows[0]
    if (!row) throw new HttpError(404, 'Invoice not found.')
    if (totals.total < row.paid) {
      throw new HttpError(400, 'The total cannot be lower than the amount already paid.')
    }
    let currency = wantedCurrency
    let baseRate = draftRate
    if (row.sent_at || baseRate === null) {
      if (wantedCurrency !== row.currency) {
        throw new HttpError(409, 'The currency cannot be changed after an invoice has been sent.')
      }
      currency = row.currency
      baseRate = row.baseRate
    }
    await db.query(
      `UPDATE invoices SET client_id = $3, project_id = $4, issue_date = $5, due_date = $6, tax_rate = $7,
              subtotal = $8, tax = $9, total = $10, notes = $11, currency = $12, base_rate = $13, updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, req.userId, input.clientId, input.projectId, input.issueDate, input.dueDate, input.taxRate,
       totals.subtotal, totals.tax, totals.total, input.notes, currency, baseRate],
    )
    await writeItems(db, invoiceId, input.items)
    await db.query('COMMIT')
    res.json(await loadDetail(invoiceId, req.userId))
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    db.release()
  }
})

const sendSchema = z.object({
  /** false = just mark it as sent (e.g. you sent it on WhatsApp yourself) */
  email: z.boolean().default(false),
  /** Defaults to the client's email */
  to: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')).optional(),
  message: z.string().trim().max(5000).default(''),
})

/** 32 random bytes as URL-safe text (43 characters): far too many possibilities to guess. */
const newPublicToken = () => randomBytes(32).toString('base64url')

// POST /api/invoices/:id/send  body: { email?, to?, message? }
// Marks the invoice as sent (freezing its exchange rate), gives it a public link, and
// optionally emails that link to the client. Calling it again re-sends the email.
invoicesRouter.post('/:id/send', async (req, res) => {
  const invoiceId = id(req.params.id)
  const input = sendSchema.parse(req.body ?? {})
  const invoice = await loadInvoice(invoiceId, req.userId)

  // Sending freezes the invoice's rate. If this is the first send, take today's rate first
  // (if rates are unreachable, keep the rate the draft already has rather than block sending).
  let baseRate: number = invoice.baseRate
  if (!invoice.sentAt) {
    try {
      const { currency: homeCurrency } = await getSettings(req.userId)
      baseRate = (await getRate(invoice.currency, homeCurrency)).rate
    } catch {
      /* keep the existing rate */
    }
  }

  // The link must exist before we can email it. COALESCE keeps an existing token, so links
  // already sent to the client keep working.
  const { rows } = await pool.query(
    'UPDATE invoices SET public_token = COALESCE(public_token, $3) WHERE id = $1 AND user_id = $2 RETURNING public_token',
    [invoiceId, req.userId, newPublicToken()],
  )
  const link = publicInvoiceUrl(rows[0].public_token)

  // Email FIRST, then record it as sent: if the email fails, the invoice stays as it was.
  let delivery = null
  if (input.email) {
    const business = await getBusiness(req.userId)
    try {
      delivery = await sendEmail(
        invoiceEmail({
          to: input.to ?? invoice.clientEmail,
          replyTo: business.email,
          businessName: business.name,
          clientName: invoice.clientName,
          reference: invoice.reference,
          currency: invoice.currency,
          balance: invoice.balance,
          dueDate: invoice.dueDate,
          message: input.message || defaultInvoiceMessage(invoice.clientName, business.name, invoice.reference),
          link,
        }),
      )
    } catch (err) {
      console.error('Invoice email failed:', err)
      throw new HttpError(502, 'We could not send the email. Please try again in a moment.')
    }
  }

  await pool.query(
    `UPDATE invoices SET sent_at = COALESCE(sent_at, now()), base_rate = CASE WHEN sent_at IS NULL THEN $3 ELSE base_rate END,
            last_emailed_at = CASE WHEN $4 THEN now() ELSE last_emailed_at END, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [invoiceId, req.userId, baseRate, input.email],
  )
  // delivery: 'email' (really sent), 'console' (dev: printed in the API terminal) or null (not emailed)
  res.json({ ...(await loadDetail(invoiceId, req.userId)), delivery })
})

// DELETE /api/invoices/:id  -> drafts only
invoicesRouter.delete('/:id', async (req, res) => {
  const invoice = await loadInvoice(id(req.params.id), req.userId)
  if (invoice.status !== 'draft') throw new HttpError(409, 'Only draft invoices can be deleted.')
  await pool.query('DELETE FROM invoices WHERE id = $1 AND user_id = $2', [invoice.id, req.userId])
  res.status(204).end()
})

// POST /api/invoices/:id/payments
invoicesRouter.post('/:id/payments', async (req, res) => {
  const invoiceId = id(req.params.id)
  const input = paymentSchema.parse(req.body)

  // What was this payment worth in the account's home currency? Work it out before the transaction
  // (it may need a network call for the exchange rate).
  const invoice = await loadInvoice(invoiceId, req.userId)
  const { currency: homeCurrency } = await getSettings(req.userId)
  const amount = round2(input.amount)
  let baseAmount = amount
  let exchangeRate = 1
  if (invoice.currency !== homeCurrency) {
    if (input.baseAmount) {
      // The person told us what they really received (their bank's rate, fees...): that is the truth.
      baseAmount = round2(input.baseAmount)
      exchangeRate = baseAmount / amount
    } else {
      exchangeRate = (await getRate(invoice.currency, homeCurrency)).rate
      baseAmount = round2(amount * exchangeRate)
    }
  }

  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const locked = await db.query('SELECT 1 FROM invoices WHERE id = $1 AND user_id = $2 FOR UPDATE', [invoiceId, req.userId])
    if (!locked.rowCount) throw new HttpError(404, 'Invoice not found.')

    const { rows } = await db.query(
      `SELECT i.sent_at, (i.total - COALESCE(pay.paid, 0))::float8 AS balance
       FROM invoices i ${PAID_JOIN} WHERE i.id = $1`,
      [invoiceId],
    )
    if (!rows[0].sent_at) throw new HttpError(409, 'Send the invoice before recording a payment.')
    if (input.amount > rows[0].balance + 0.005) {
      throw new HttpError(400, `Payment is more than the balance due (${rows[0].balance}).`)
    }
    await db.query(
      `INSERT INTO payments (user_id, invoice_id, amount, base_amount, exchange_rate, paid_on, method, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.userId, invoiceId, amount, baseAmount, exchangeRate, input.paidOn, input.method, input.note],
    )
    await db.query('COMMIT')
    res.status(201).json(await loadDetail(invoiceId, req.userId))
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    db.release()
  }
})

// GET /api/payments  -> payment history across all invoices
paymentsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${PAYMENT_COLUMNS}, i.currency, i.prefix || lpad(i.number::text, 3, '0') AS "invoiceReference", c.name AS "clientName"
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN clients c ON c.id = i.client_id
     WHERE p.user_id = $1
     ORDER BY p.paid_on DESC, p.created_at DESC`,
    [req.userId],
  )
  res.json({ payments: rows })
})

// DELETE /api/payments/:id  -> undo a mistaken payment
paymentsRouter.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM payments WHERE id = $1 AND user_id = $2', [id(req.params.id), req.userId])
  if (!rowCount) throw new HttpError(404, 'Payment not found.')
  res.status(204).end()
})
