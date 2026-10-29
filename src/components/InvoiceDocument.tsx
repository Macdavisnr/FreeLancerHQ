import type { ReactNode } from 'react'
import type { InvoiceItem } from '@/types/invoice'
import type { Business } from '@/types/settings'
import { formatCurrency, formatDate } from '@/utils/format'

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    // min-w-0 + overflow-wrap: long email addresses wrap instead of running into the next column
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <p className="text-sm text-muted">{label}</p>
      <div className="font-bold">{children}</div>
    </div>
  )
}

function Row({ label, children, bold }: { label: string; children: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 ${bold ? 'font-extrabold' : 'text-muted'}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  )
}

interface Props {
  business: Business
  client: { name: string; email: string; company?: string; address?: string }
  invoice: {
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
  }
  items: Omit<InvoiceItem, 'id'>[]
}

/**
 * The invoice itself: From / Bill to / dates, the lines, the totals and the notes.
 * Shared by the freelancer's invoice page and the client's public page, so both always match.
 */
export default function InvoiceDocument({ business, client, invoice, items }: Props) {
  const money = (amount: number) => formatCurrency(amount, invoice.currency)
  return (
    <>
      <section className="grid gap-4 rounded-2xl border border-line bg-white p-6 shadow-sm sm:grid-cols-3">
        <Meta label="From">
          {business.name}
          <p className="font-normal text-muted">{business.email}</p>
          {business.phone && <p className="font-normal text-muted">{business.phone}</p>}
          {business.address && <p className="font-normal text-muted">{business.address}</p>}
        </Meta>
        <Meta label="Bill to">
          {client.name}
          {client.company && <p className="font-normal text-muted">{client.company}</p>}
          <p className="font-normal text-muted">{client.email}</p>
          {client.address && <p className="font-normal text-muted">{client.address}</p>}
        </Meta>
        <Meta label="Issued">{formatDate(invoice.issueDate)}</Meta>
        <Meta label="Due">{formatDate(invoice.dueDate)}</Meta>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        {/* Phones: Qty and Rate fold under the description, so Amount always fits. */}
        <table className="w-full text-left">
          <thead className="bg-canvas text-sm text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold sm:px-6">Description</th>
              <th className="hidden px-3 py-3 font-semibold sm:table-cell">Qty</th>
              <th className="hidden px-3 py-3 font-semibold sm:table-cell">Rate</th>
              <th className="px-4 py-3 text-right font-semibold sm:px-6">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-3.5 sm:px-6">
                  {it.description}
                  <span className="block text-sm text-muted sm:hidden">{it.quantity} × {money(it.unitPrice)}</span>
                </td>
                <td className="hidden px-3 py-3.5 sm:table-cell">{it.quantity}</td>
                <td className="hidden px-3 py-3.5 sm:table-cell">{money(it.unitPrice)}</td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap sm:px-6">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-full max-w-xs border-t border-line px-4 py-4 sm:px-6">
          <Row label="Subtotal">{money(invoice.subtotal)}</Row>
          <Row label={`Tax (${invoice.taxRate}%)`}>{money(invoice.tax)}</Row>
          <Row label="Total" bold>{money(invoice.total)}</Row>
          <Row label="Paid">{money(invoice.paid)}</Row>
          <Row label="Balance due" bold>{money(invoice.balance)}</Row>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-bold">Notes</h2>
        <p className="text-muted">{invoice.notes || 'No notes.'}</p>
      </section>
    </>
  )
}
