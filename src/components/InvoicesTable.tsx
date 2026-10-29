import { Link, useNavigate } from 'react-router-dom'
import InvoiceStatusBadge from '@/components/InvoiceStatusBadge'
import type { Invoice } from '@/types/invoice'
import { formatCurrency, formatDate, isForeignCurrency } from '@/utils/format'

interface Props {
  invoices: Invoice[] | null // null = still loading
  emptyMessage: string
  /** The client column is redundant on a client's own page. */
  showClient?: boolean
}

export default function InvoicesTable({ invoices, emptyMessage, showClient = true }: Props) {
  const navigate = useNavigate()
  const columns = showClient ? 5 : 4

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-left">
        <thead className="bg-canvas text-sm text-muted">
          <tr>
            <th className="px-6 py-3 font-semibold">Invoice</th>
            {showClient && <th className="px-6 py-3 font-semibold">Client</th>}
            <th className="px-6 py-3 font-semibold">Due</th>
            <th className="px-6 py-3 font-semibold">Amount</th>
            <th className="px-6 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices === null && (
            <tr><td colSpan={columns} className="px-6 py-8 text-center text-muted">Loading…</td></tr>
          )}
          {invoices?.length === 0 && (
            <tr><td colSpan={columns} className="px-6 py-8 text-center text-muted">{emptyMessage}</td></tr>
          )}
          {invoices?.map((inv) => (
            <tr
              key={inv.id}
              onClick={() => navigate(`/invoices/${inv.id}`)}
              className="cursor-pointer border-t border-line hover:bg-canvas"
            >
              <td className="px-6 py-4 font-medium">
                <Link to={`/invoices/${inv.id}`}>{inv.reference}</Link>
              </td>
              {showClient && <td className="px-6 py-4">{inv.clientName}</td>}
              <td className="px-6 py-4">{formatDate(inv.dueDate)}</td>
              <td className="px-6 py-4">
                {formatCurrency(inv.total, inv.currency)}
                {isForeignCurrency(inv.currency) && (
                  <span className="block text-xs text-muted">≈ {formatCurrency(inv.totalBase)}</span>
                )}
              </td>
              <td className="px-6 py-4"><InvoiceStatusBadge status={inv.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
