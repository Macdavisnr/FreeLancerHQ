import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import { deletePayment, listPayments } from '@/services/invoiceService'
import type { Payment } from '@/types/invoice'
import { formatCurrency, formatDate, isForeignCurrency } from '@/utils/format'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listPayments().then(setPayments)
  }, [])

  // Totals are in the account's home currency: what each payment was worth when it arrived.
  const total = payments?.reduce((sum, p) => sum + p.baseAmount, 0) ?? 0

  async function handleDelete(id: string) {
    if (!window.confirm('Remove this payment? The invoice balance will go back up.')) return
    setError('')
    try {
      await deletePayment(id)
      setPayments((list) => list?.filter((p) => p.id !== id) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove payment.')
    }
  }

  return (
    <>
      <PageHeader title="Payments" subtitle="Every payment you have received." />
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard label="Total received" value={formatCurrency(total)} note={`${payments?.length ?? 0} payments`} tone="green" />
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left">
          <thead className="bg-canvas text-sm text-muted">
            <tr>
              <th className="px-6 py-3 font-semibold">Date</th>
              <th className="px-6 py-3 font-semibold">Invoice</th>
              <th className="px-6 py-3 font-semibold">Client</th>
              <th className="px-6 py-3 font-semibold">Method</th>
              <th className="px-6 py-3 font-semibold">Amount</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {payments === null && <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">Loading…</td></tr>}
            {payments?.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">No payments yet. Record one from an invoice.</td></tr>
            )}
            {payments?.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-6 py-4">{formatDate(p.paidOn)}</td>
                <td className="px-6 py-4 font-medium">
                  <Link to={`/invoices/${p.invoiceId}`} className="text-brand-700">{p.invoiceReference}</Link>
                </td>
                <td className="px-6 py-4">{p.clientName}</td>
                <td className="px-6 py-4">{p.method || '—'}</td>
                <td className="px-6 py-4">
                  {formatCurrency(p.amount, p.currency)}
                  {p.currency && isForeignCurrency(p.currency) && (
                    <span className="block text-xs text-muted">
                      → {formatCurrency(p.baseAmount)} received (1 {p.currency} = {p.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 4 })})
                    </span>
                  )}
                </td>
                <td className="px-3">
                  <button onClick={() => handleDelete(p.id)} aria-label="Remove payment" className="px-2 text-muted hover:text-red-600">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
