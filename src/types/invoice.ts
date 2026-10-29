export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

/** Mirrors the `invoices` table. paid, balance and status are computed by the server. */
export interface Invoice {
  id: string
  number: number
  /** Prefix + number as issued, e.g. "INV-014". Fixed once the invoice is created. */
  reference: string
  clientId: string
  clientName: string
  clientEmail: string
  projectId: string | null
  projectName: string | null
  issueDate: string
  dueDate: string
  taxRate: number
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  /** The currency this invoice is billed in (amounts above are in it). */
  currency: string
  /** 1 unit of the invoice currency = baseRate units of the account's home currency (saved on the invoice). */
  baseRate: number
  /** total and balance converted to the home currency using baseRate */
  totalBase: number
  balanceBase: number
  notes: string
  sentAt: string | null
  createdAt: string
  status: InvoiceStatus
  /** The secret part of the client's link (/i/<token>). null until the invoice is sent. */
  publicToken: string | null
  lastEmailedAt: string | null
  /** First time the client opened the link */
  viewedAt: string | null
}

/** What the client sees on the public invoice page (no internal ids). */
export interface PublicInvoice {
  reference: string
  clientName: string
  clientEmail: string
  clientCompany: string
  clientAddress: string
  issueDate: string
  dueDate: string
  currency: string
  taxRate: number
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  notes: string
  status: InvoiceStatus
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface Payment {
  id: string
  invoiceId: string
  amount: number
  paidOn: string
  /** What this payment was worth in the home currency when it was received. */
  baseAmount: number
  exchangeRate: number
  method: string
  note: string
  createdAt: string
  /** Only present on the all-payments list */
  currency?: string
  invoiceReference?: string
  clientName?: string
}

export interface InvoiceInput {
  clientId: string
  projectId: string | null
  issueDate: string
  dueDate: string
  taxRate: number
  currency: string
  notes: string
  items: { description: string; quantity: number; unitPrice: number }[]
}

export interface InvoiceSummary {
  paidThisMonth: number
  outstanding: number
  outstandingCount: number
  overdue: number
  overdueCount: number
}

export interface PaymentInput {
  /** In the invoice's currency */
  amount: number
  /** What actually arrived, in the home currency. Leave out to use today's market rate. */
  baseAmount?: number
  paidOn: string
  method: string
  note: string
}
