import { pool } from './db.js'
import { appUrl, publicInvoiceUrl } from './invoiceEmail.js'
import { escapeHtml, sendEmail, type EmailMessage } from './notify.js'
import { getBusiness, getSettings } from './settings.js'
import { PAID_JOIN } from './sql.js'

/*
 * NOTIFICATIONS
 *
 * Every notification is a row in `notifications` (that's the bell in the app). Some are ALSO
 * emailed, if the person switched that on in Settings. In-app ones are always created.
 *
 * Two kinds of trigger:
 *  - EVENTS, the moment something happens: a client pays online, a client opens an invoice.
 *  - SCHEDULED checks, run by a timer (see scheduler.ts): overdue invoices, the weekly summary.
 */

type Kind = 'invoice_paid' | 'invoice_viewed' | 'invoice_overdue' | 'weekly_summary'

/**
 * Insert a notification. With a dedupeKey, a second call with the same key does nothing and
 * returns false: that is how a job "claims" a piece of work, so only the call that created the
 * row goes on to send the email. Two overlapping runs can't both send it.
 */
async function createNotification(n: { userId: string; kind: Kind; title: string; body?: string; link?: string; dedupeKey?: string }) {
  const { rowCount } = await pool.query(
    `INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [n.userId, n.kind, n.title, n.body ?? '', n.link ?? null, n.dedupeKey ?? null],
  )
  return rowCount === 1
}

/*
 * Claim-then-send gives "AT MOST ONCE" delivery: if the email fails after the row was claimed,
 * it isn't retried (the in-app notification still exists). The alternative, send-then-record,
 * is "at least once": a crash in between means a duplicate email. For reminders, a missed
 * email is better than a double one, so we claim first.
 */
async function trySend(message: EmailMessage, what: string) {
  try {
    await sendEmail(message)
  } catch (err) {
    console.error(`Could not email ${what}:`, err)
  }
}

/** A simple branded email: heading, a few lines, an optional button. */
function simpleEmail(e: { to: string; subject: string; heading: string; lines: string[]; cta?: { label: string; url: string }; replyTo?: string }): EmailMessage {
  const esc = escapeHtml
  return {
    to: e.to,
    replyTo: e.replyTo,
    subject: e.subject,
    text: `${e.heading}\n\n${e.lines.join('\n')}${e.cta ? `\n\n${e.cta.label}: ${e.cta.url}` : ''}`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#1a1a3a;line-height:1.5">
  <h2 style="margin:0 0 12px">${esc(e.heading)}</h2>
  ${e.lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('')}
  ${e.cta ? `<p style="margin:20px 0"><a href="${esc(e.cta.url)}" style="display:inline-block;background:#6258ff;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(e.cta.label)}</a></p>` : ''}
  <p style="color:#6b6b8a;font-size:13px;margin:16px 0 0">FreelanceHQ</p>
</div>`,
  }
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount)

async function ownerEmail(userId: string): Promise<string> {
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId])
  return rows[0].email
}

/** Basic facts about one invoice, for messages. */
async function invoiceFacts(invoiceId: string) {
  const { rows } = await pool.query(
    `SELECT i.id, i.user_id, i.prefix || lpad(i.number::text, 3, '0') AS reference, i.currency, i.public_token,
            to_char(i.due_date, 'YYYY-MM-DD') AS "dueDate", (CURRENT_DATE - i.due_date) AS "daysOverdue",
            (i.total - COALESCE(pay.paid, 0))::float8 AS balance, c.name AS "clientName", c.email AS "clientEmail"
     FROM invoices i JOIN clients c ON c.id = i.client_id ${PAID_JOIN} WHERE i.id = $1`,
    [invoiceId],
  )
  return rows[0]
}

// ---------------------------------------------------------------------------------- EVENTS

/** A client paid online (called once per payment, from recordOnlinePayment). */
export async function notifyInvoicePaid(invoiceId: string, amount: number) {
  const inv = await invoiceFacts(invoiceId)
  const full = inv.balance <= 0.005
  const title = `${money(amount, inv.currency)} received for ${inv.reference}`
  const body = `${inv.clientName} paid online${full ? '. The invoice is now paid in full.' : `. ${money(inv.balance, inv.currency)} is still due.`}`
  await createNotification({ userId: inv.user_id, kind: 'invoice_paid', title, body, link: `/invoices/${inv.id}` })

  if ((await getSettings(inv.user_id)).notifyInvoicePaid) {
    await trySend(
      simpleEmail({ to: await ownerEmail(inv.user_id), subject: `💰 ${title}`, heading: title, lines: [body], cta: { label: 'Open invoice', url: `${appUrl()}/invoices/${inv.id}` } }),
      'payment notification',
    )
  }
}

/** The client opened the invoice link for the first time. In-app only (it would be a lot of email). */
export async function notifyInvoiceViewed(invoiceId: string) {
  const inv = await invoiceFacts(invoiceId)
  await createNotification({
    userId: inv.user_id,
    kind: 'invoice_viewed',
    title: `${inv.clientName} viewed ${inv.reference}`,
    link: `/invoices/${inv.id}`,
    dedupeKey: `viewed:${inv.id}`,
  })
}

// ------------------------------------------------------------------------------ SCHEDULED

/*
 * Overdue reminders go out in STAGES: 1, 7, 14 and 30 days after the due date. Each run works
 * out which stage every overdue invoice has reached and claims "overdue:<invoice>:<stage>".
 * Because it asks "which stage have we REACHED" (not "is it exactly day 7"), a run that was
 * missed (server asleep, deploy...) simply catches up on the next run.
 */
const OVERDUE_STAGES = [30, 14, 7, 1]

export async function checkOverdueInvoices() {
  const { rows } = await pool.query(
    `SELECT i.id FROM invoices i ${PAID_JOIN}
     WHERE i.sent_at IS NOT NULL AND i.due_date < CURRENT_DATE AND i.total - COALESCE(pay.paid, 0) > 0.005`,
  )
  let sent = 0
  for (const { id } of rows) {
    const inv = await invoiceFacts(id)
    const stage = OVERDUE_STAGES.find((s) => inv.daysOverdue >= s)!
    const amount = money(inv.balance, inv.currency)
    const claimed = await createNotification({
      userId: inv.user_id,
      kind: 'invoice_overdue',
      title: `${inv.reference} is ${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} overdue`,
      body: `${inv.clientName} still owes ${amount}.`,
      link: `/invoices/${inv.id}`,
      dedupeKey: `overdue:${inv.id}:${stage}`,
    })
    if (!claimed) continue // this stage was already handled by an earlier run
    sent++

    const settings = await getSettings(inv.user_id)
    if (settings.notifyOverdue) {
      await trySend(
        simpleEmail({
          to: await ownerEmail(inv.user_id),
          subject: `${inv.reference} from ${inv.clientName} is overdue`,
          heading: `${inv.reference} is ${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} overdue`,
          lines: [`${inv.clientName} still owes ${amount}.`, settings.remindClientsOverdue ? 'We have also sent them a polite reminder.' : 'You might want to send them a reminder.'],
          cta: { label: 'Open invoice', url: `${appUrl()}/invoices/${inv.id}` },
        }),
        'overdue notification',
      )
    }
    // Opt-in: a polite reminder to the CLIENT, with the link to view (and pay) the invoice.
    if (settings.remindClientsOverdue && inv.public_token) {
      const business = await getBusiness(inv.user_id)
      await trySend(
        simpleEmail({
          to: inv.clientEmail,
          replyTo: business.email,
          subject: `Reminder: invoice ${inv.reference} from ${business.name}`,
          heading: `A friendly reminder about ${inv.reference}`,
          lines: [`Hi ${inv.clientName},`, `Invoice ${inv.reference} for ${amount} was due on ${inv.dueDate}. If you have already paid, thank you, and please ignore this message.`, `Questions? Just reply to this email.`],
          cta: { label: 'View invoice', url: publicInvoiceUrl(inv.public_token) },
        }),
        'client reminder',
      )
    }
  }
  return sent
}

/**
 * The weekly summary: once per ISO week (e.g. "2026-W44"), for everyone with any activity.
 * The week key is the dedupe key, so however often the job runs, each person gets one per week.
 */
export async function sendWeeklySummaries() {
  const { rows: weekRow } = await pool.query(`SELECT to_char(CURRENT_DATE, 'IYYY-"W"IW') AS week`)
  const week = weekRow[0].week
  const { rows: users } = await pool.query(
    `SELECT u.id, u.email, COALESCE(s.currency, 'USD') AS currency FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
     WHERE EXISTS (SELECT 1 FROM invoices WHERE user_id = u.id) OR EXISTS (SELECT 1 FROM projects WHERE user_id = u.id)`,
  )
  let sent = 0
  for (const user of users) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COALESCE(SUM(base_amount), 0)::float8 FROM payments WHERE user_id = $1 AND paid_on >= CURRENT_DATE - 7 AND paid_on < CURRENT_DATE) AS revenue,
         (SELECT COALESCE(SUM(amount), 0)::float8 FROM expenses WHERE user_id = $1 AND spent_on >= CURRENT_DATE - 7 AND spent_on < CURRENT_DATE) AS expenses,
         (SELECT COALESCE(SUM((i.total - COALESCE(pay.paid, 0)) * i.base_rate), 0)::float8 FROM invoices i ${PAID_JOIN}
            WHERE i.user_id = $1 AND i.sent_at IS NOT NULL AND i.total - COALESCE(pay.paid, 0) > 0.005) AS outstanding,
         (SELECT COUNT(*)::int FROM invoices i ${PAID_JOIN}
            WHERE i.user_id = $1 AND i.sent_at IS NOT NULL AND i.due_date < CURRENT_DATE AND i.total - COALESCE(pay.paid, 0) > 0.005) AS overdue,
         (SELECT COUNT(*)::int FROM projects WHERE user_id = $1 AND status <> 'completed' AND deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 6) AS deadlines,
         (SELECT COUNT(*)::int FROM tasks WHERE user_id = $1 AND NOT done AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6) AS tasks,
         (SELECT COUNT(*)::int FROM events WHERE user_id = $1 AND date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6) AS events`,
      [user.id],
    )
    const w = rows[0]
    const cur = (n: number) => money(n, user.currency)
    const lines = [
      `Received last 7 days: ${cur(w.revenue)}`,
      `Spent last 7 days: ${cur(w.expenses)}`,
      `Outstanding: ${cur(w.outstanding)}${w.overdue ? ` (${w.overdue} invoice${w.overdue === 1 ? '' : 's'} overdue)` : ''}`,
      `This week: ${w.deadlines} project deadline${w.deadlines === 1 ? '' : 's'}, ${w.tasks} task${w.tasks === 1 ? '' : 's'} due, ${w.events} event${w.events === 1 ? '' : 's'}`,
    ]
    const claimed = await createNotification({
      userId: user.id,
      kind: 'weekly_summary',
      title: `Your week: ${cur(w.revenue)} received`,
      body: lines.slice(1).join(' · '),
      link: '/dashboard',
      dedupeKey: `weekly:${week}`,
    })
    if (!claimed) continue
    sent++
    if ((await getSettings(user.id)).notifyWeekly) {
      await trySend(
        simpleEmail({ to: user.email, subject: `Your FreelanceHQ week: ${cur(w.revenue)} received`, heading: 'Your weekly summary', lines, cta: { label: 'Open dashboard', url: `${appUrl()}/dashboard` } }),
        'weekly summary',
      )
    }
  }
  return sent
}

/** Everything the timer runs. Safe to call as often as you like: every step is deduplicated. */
export async function runScheduledJobs() {
  const overdue = await checkOverdueInvoices()
  const weekly = await sendWeeklySummaries()
  return { overdue, weekly }
}
