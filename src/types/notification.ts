export type NotificationKind = 'invoice_paid' | 'invoice_viewed' | 'invoice_overdue' | 'weekly_summary'

/** Mirrors the `notifications` table. */
export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  /** In-app path to open, e.g. /invoices/<id> */
  link: string | null
  readAt: string | null
  createdAt: string
}
