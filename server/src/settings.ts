import { pool } from './db.js'

const SETTINGS_COLUMNS = `
  business_name AS "businessName", business_email AS "businessEmail",
  business_phone AS "businessPhone", business_address AS "businessAddress",
  currency, invoice_prefix AS "invoicePrefix", payment_terms_days AS "paymentTermsDays",
  invoice_note AS "invoiceNote", notify_invoice_paid AS "notifyInvoicePaid",
  notify_overdue AS "notifyOverdue", notify_weekly AS "notifyWeekly",
  notify_product AS "notifyProduct", remind_clients_overdue AS "remindClientsOverdue"`

export const SETTINGS_SELECT = SETTINGS_COLUMNS

export const DEFAULT_SETTINGS = {
  businessName: '',
  businessEmail: '',
  businessPhone: '',
  businessAddress: '',
  currency: 'USD',
  invoicePrefix: 'INV-',
  paymentTermsDays: 14,
  invoiceNote: 'Thank you for your business.',
  notifyInvoicePaid: true,
  notifyOverdue: true,
  notifyWeekly: true,
  notifyProduct: false,
  remindClientsOverdue: false,
}

export type Settings = typeof DEFAULT_SETTINGS

/** The user's saved settings, or the defaults if they have never saved any. */
export async function getSettings(userId: string): Promise<Settings> {
  const { rows } = await pool.query(`SELECT ${SETTINGS_COLUMNS} FROM user_settings WHERE user_id = $1`, [userId])
  return rows[0] ?? DEFAULT_SETTINGS
}

/**
 * The account currency can only be changed while the account holds no money data.
 * Afterwards, invoices, payments, expenses and budgets would silently change meaning.
 */
export async function isCurrencyLocked(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM invoices WHERE user_id = $1)
         OR EXISTS (SELECT 1 FROM payments WHERE user_id = $1)
         OR EXISTS (SELECT 1 FROM expenses WHERE user_id = $1)
         OR EXISTS (SELECT 1 FROM projects WHERE user_id = $1) AS locked`,
    [userId],
  )
  return rows[0].locked
}

/** Who an invoice is "From": the business details, falling back to the person's own account. */
export async function getBusiness(userId: string) {
  const settings = await getSettings(userId)
  const { rows } = await pool.query('SELECT name, email, phone FROM users WHERE id = $1', [userId])
  const user = rows[0]
  return {
    name: settings.businessName || user.name,
    email: settings.businessEmail || user.email,
    phone: settings.businessPhone || user.phone,
    address: settings.businessAddress,
  }
}
