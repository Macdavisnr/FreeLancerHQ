import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { normalizePhone, PHONE_ERROR } from '../phone.js'
import { currencyCode } from '../currencies.js'
import { getSettings, isCurrencyLocked, SETTINGS_SELECT } from '../settings.js'
import { USER_COLUMNS } from '../users.js'

export const settingsRouter = Router()
export const profileRouter = Router()

settingsRouter.use(requireAuth)
profileRouter.use(requireAuth)

const settingsSchema = z.object({
  businessName: z.string().trim().max(120),
  businessEmail: z.union([z.literal(''), z.string().trim().pipe(z.email('Enter a valid business email.'))]),
  businessPhone: z.string().trim().max(40),
  businessAddress: z.string().trim().max(300),
  currency: currencyCode,
  invoicePrefix: z
    .string()
    .trim()
    .min(1, 'Invoice prefix is required.')
    .max(10, 'Invoice prefix is too long (max 10 characters).')
    .regex(/^[A-Za-z0-9\-_.]+$/, 'Invoice prefix can only use letters, numbers, - _ and .'),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  invoiceNote: z.string().trim().max(1000),
  notifyInvoicePaid: z.boolean(),
  notifyOverdue: z.boolean(),
  notifyWeekly: z.boolean(),
  notifyProduct: z.boolean(),
})

// GET /api/settings
settingsRouter.get('/', async (req, res) => {
  res.json({ settings: await getSettings(req.userId), currencyLocked: await isCurrencyLocked(req.userId) })
})

// PUT /api/settings  -> "upsert": create the row on first save, update it afterwards
settingsRouter.put('/', async (req, res) => {
  const s = settingsSchema.parse(req.body)

  const current = await getSettings(req.userId)
  if (s.currency !== current.currency && (await isCurrencyLocked(req.userId))) {
    throw new HttpError(
      409,
      'Your account currency cannot be changed once you have invoices, payments, expenses or projects.',
    )
  }

  const { rows } = await pool.query(
    `INSERT INTO user_settings (user_id, business_name, business_email, business_phone, business_address, currency,
        invoice_prefix, payment_terms_days, invoice_note, notify_invoice_paid, notify_overdue, notify_weekly, notify_product)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (user_id) DO UPDATE SET
        business_name = EXCLUDED.business_name, business_email = EXCLUDED.business_email,
        business_phone = EXCLUDED.business_phone, business_address = EXCLUDED.business_address,
        currency = EXCLUDED.currency, invoice_prefix = EXCLUDED.invoice_prefix,
        payment_terms_days = EXCLUDED.payment_terms_days, invoice_note = EXCLUDED.invoice_note,
        notify_invoice_paid = EXCLUDED.notify_invoice_paid, notify_overdue = EXCLUDED.notify_overdue,
        notify_weekly = EXCLUDED.notify_weekly, notify_product = EXCLUDED.notify_product, updated_at = now()
     RETURNING ${SETTINGS_SELECT}`,
    [req.userId, s.businessName, s.businessEmail, s.businessPhone, s.businessAddress, s.currency, s.invoicePrefix,
     s.paymentTermsDays, s.invoiceNote, s.notifyInvoicePaid, s.notifyOverdue, s.notifyWeekly, s.notifyProduct],
  )
  res.json({ settings: rows[0], currencyLocked: await isCurrencyLocked(req.userId) })
})

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  title: z.string().trim().max(120).default(''),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  phone: z.string().trim().max(40).default(''),
  bio: z.string().trim().max(1000).default(''),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
})

// PUT /api/profile
profileRouter.put('/', async (req, res) => {
  const p = profileSchema.parse(req.body)
  let phone = ''
  if (p.phone) {
    const normalized = normalizePhone(p.phone)
    if (!normalized) throw new HttpError(400, PHONE_ERROR)
    phone = normalized
  }
  try {
    // Changing your email or phone means the new one has not been verified yet. In an UPDATE,
    // the right-hand side reads the OLD row, so "email_verified AND email = $4" keeps the flag
    // only when the value did not change.
    const { rows } = await pool.query(
      `UPDATE users SET name = $2, title = $3, email = $4, phone = $5, bio = $6,
              email_verified = (email_verified AND email = $4),
              phone_verified = (phone_verified AND phone = $5),
              updated_at = now()
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [req.userId, p.name, p.title, p.email, phone, p.bio],
    )
    res.json({ user: rows[0] })
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new HttpError(409, 'Another account already uses this email.')
    }
    throw err
  }
})

// PUT /api/profile/password
profileRouter.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body)
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId])
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect.')
  }
  await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    req.userId,
    await bcrypt.hash(newPassword, 10),
  ])
  res.status(204).end()
})
