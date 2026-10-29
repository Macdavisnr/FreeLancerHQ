export interface Settings {
  businessName: string
  businessEmail: string
  businessPhone: string
  businessAddress: string
  currency: string
  invoicePrefix: string
  paymentTermsDays: number
  invoiceNote: string
  notifyInvoicePaid: boolean
  notifyOverdue: boolean
  notifyWeekly: boolean
  notifyProduct: boolean
  /** Also email clients a reminder (with the Pay link) when their invoice is overdue */
  remindClientsOverdue: boolean
}

/** The "From" block on an invoice. */
export interface Business {
  name: string
  email: string
  phone: string
  address: string
}

/** Is the user's own Paystack account connected? The secret key itself never comes back. */
export interface PaystackConnection {
  connected: boolean
  mode: 'test' | 'live' | null
  /** Last 4 characters of the key, to recognise it */
  last4: string | null
  connectedAt: string | null
  /** The URL to paste into Paystack's dashboard as the webhook URL */
  webhookUrl: string
}
