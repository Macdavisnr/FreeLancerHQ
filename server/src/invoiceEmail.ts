import { escapeHtml, type EmailMessage } from './notify.js'

/** The web app's public address, for links in emails. */
export const appUrl = () => (process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5180').replace(/\/$/, '')

export const publicInvoiceUrl = (token: string) => `${appUrl()}/i/${token}`

interface InvoiceEmailInput {
  to: string
  replyTo: string
  businessName: string
  clientName: string
  reference: string
  currency: string
  balance: number
  dueDate: string // 'YYYY-MM-DD'
  message: string
  link: string
}

// Whole amounts without ".00", like the app.
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)

// '2026-11-11' -> '11 Nov 2026'. Built from the parts so the server's timezone can't shift the day.
const longDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * The email a client receives. Every email has a plain-text version too: some mail apps
 * show only text, and spam filters distrust HTML-only mail.
 */
export function invoiceEmail(i: InvoiceEmailInput): EmailMessage {
  const amount = money(i.balance, i.currency)
  const due = longDate(i.dueDate)
  const e = escapeHtml
  const paragraphs = i.message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${e(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return {
    to: i.to,
    replyTo: i.replyTo,
    subject: `Invoice ${i.reference} from ${i.businessName}: ${amount} due ${due}`,
    text: `${i.message}\n\nInvoice: ${i.reference}\nAmount due: ${amount}\nDue: ${due}\n\nView the invoice: ${i.link}\n\nReply to this email to contact ${i.businessName}.`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#1a1a3a;line-height:1.5">
  ${paragraphs}
  <table role="presentation" style="width:100%;margin:20px 0;border:1px solid #e8e8f0;border-radius:12px;border-collapse:separate;padding:16px">
    <tr><td style="color:#6b6b8a">Invoice</td><td style="text-align:right;font-weight:700">${e(i.reference)}</td></tr>
    <tr><td style="color:#6b6b8a">Amount due</td><td style="text-align:right;font-weight:800;font-size:20px">${e(amount)}</td></tr>
    <tr><td style="color:#6b6b8a">Due</td><td style="text-align:right;font-weight:700">${e(due)}</td></tr>
  </table>
  <p style="margin:0 0 24px"><a href="${e(i.link)}" style="display:inline-block;background:#6258ff;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">View invoice</a></p>
  <p style="color:#6b6b8a;font-size:13px;margin:0">Sent by ${e(i.businessName)} using FreelanceHQ. Reply to this email to contact them.</p>
</div>`,
  }
}

/** What the "Message" box is pre-filled with. */
export function defaultInvoiceMessage(clientName: string, businessName: string, reference: string) {
  return `Hi ${clientName},\n\nPlease find invoice ${reference} below. You can view the full invoice using the link in this email.\n\nThank you,\n${businessName}`
}
