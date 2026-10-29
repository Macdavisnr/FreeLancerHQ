import { api, ApiError } from '@/lib/api'
import type { Business } from '@/types/settings'
import type {
  Invoice,
  InvoiceInput,
  InvoiceItem,
  InvoiceSummary,
  Payment,
  PaymentInput,
  PublicInvoice,
} from '@/types/invoice'

export interface InvoiceDetail {
  invoice: Invoice
  items: InvoiceItem[]
  payments: Payment[]
  /** Who the invoice is "From" (from Settings, falling back to the account). */
  business: Business
}

export async function listInvoices(
  filter: { clientId?: string; projectId?: string } = {},
): Promise<{ invoices: Invoice[]; summary: InvoiceSummary }> {
  const params = new URLSearchParams()
  if (filter.clientId) params.set('clientId', filter.clientId)
  if (filter.projectId) params.set('projectId', filter.projectId)
  const query = params.size ? `?${params}` : ''
  return api(`/invoices${query}`)
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  try {
    return await api<InvoiceDetail>(`/invoices/${id}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export const createInvoice = (input: InvoiceInput) =>
  api<InvoiceDetail>('/invoices', { method: 'POST', body: input })

export const updateInvoice = (id: string, input: InvoiceInput) =>
  api<InvoiceDetail>(`/invoices/${id}`, { method: 'PUT', body: input })

/** How an email went out: 'email' = really sent, 'console' = dev mode (printed in the API terminal). */
export type Delivery = 'email' | 'console' | null

/** Mark as sent (and optionally email the client a link). Calling it again re-sends the email. */
export const sendInvoice = (id: string, options: { email: boolean; to?: string; message?: string } = { email: false }) =>
  api<InvoiceDetail & { delivery: Delivery }>(`/invoices/${id}/send`, { method: 'POST', body: options })

/** The client's link for a sent invoice. */
export const publicInvoiceUrl = (token: string) => `${window.location.origin}/i/${token}`

/** No login needed: what the client sees. null if the link is wrong. */
export async function getPublicInvoice(token: string) {
  try {
    return await api<{
      invoice: PublicInvoice
      items: Omit<InvoiceItem, 'id'>[]
      business: Business
      /** Show the Pay button? (freelancer connected Paystack, currency supported, balance due) */
      payOnline: boolean
      paymentMode: 'test' | 'live' | null
    }>(`/public/invoices/${token}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export const deleteInvoice = (id: string) => api<void>(`/invoices/${id}`, { method: 'DELETE' })

export const recordPayment = (invoiceId: string, input: PaymentInput) =>
  api<InvoiceDetail>(`/invoices/${invoiceId}/payments`, { method: 'POST', body: input })

export async function listPayments(): Promise<Payment[]> {
  const { payments } = await api<{ payments: Payment[] }>('/payments')
  return payments
}

export const deletePayment = (id: string) => api<void>(`/payments/${id}`, { method: 'DELETE' })

/** Start a Paystack checkout; returns the Paystack page to send the client to. */
export async function startOnlinePayment(token: string): Promise<string> {
  const { authorizationUrl } = await api<{ authorizationUrl: string }>(`/public/invoices/${token}/pay`, { method: 'POST' })
  return authorizationUrl
}

/** Back from Paystack: ask OUR server to confirm with Paystack (the URL alone proves nothing). */
export async function verifyOnlinePayment(token: string, reference: string) {
  const { result } = await api<{ result: 'paid' | 'pending' | 'failed' | 'unknown' | 'mismatch' }>(
    `/public/invoices/${token}/verify`,
    { method: 'POST', body: { reference } },
  )
  return result
}
