import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import { btnPrimary } from '@/lib/ui'
import { getReport } from '@/services/reportService'
import type { Report } from '@/types/report'
import { formatCompactCurrency, formatCurrency } from '@/utils/format'

function monthLabel(month: string, long = false) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

/** Download the monthly figures as a spreadsheet-friendly CSV file. */
function exportCsv(report: Report) {
  const rows = [
    ['Month', 'Revenue', 'Expenses', 'Profit'],
    ...report.months.map((m) => [monthLabel(m.month, true), m.revenue, m.expenses, m.profit]),
  ]
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'freelancehq-report.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load reports.'))
  }, [])

  const growth =
    report && report.revenueLastMonth > 0
      ? ((report.revenueThisMonth - report.revenueLastMonth) / report.revenueLastMonth) * 100
      : null
  const maxAmount = Math.max(1, ...(report?.months.flatMap((m) => [m.revenue, m.expenses]) ?? []))

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="How your business is performing."
        action={
          <button disabled={!report} onClick={() => report && exportCsv(report)} className={btnPrimary}>
            Export
          </button>
        }
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatCurrency(report?.revenueThisMonth ?? 0)}
          note={growth === null ? 'Received this month' : `${growth >= 0 ? '+' : '−'}${Math.abs(growth).toFixed(1)}% vs last month`}
          tone="green"
        />
        <StatCard label="Expenses" value={formatCurrency(report?.expensesThisMonth ?? 0)} note="This month" tone="red" />
        <StatCard label="Estimated profit" value={formatCurrency(report?.profitThisMonth ?? 0)} note="Revenue minus expenses" tone="blue" />
        <StatCard
          label="Outstanding"
          value={formatCurrency(report?.outstanding ?? 0)}
          note={`${report?.outstandingCount ?? 0} invoice${report?.outstandingCount === 1 ? '' : 's'}`}
          tone="amber"
        />
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="mb-5 font-bold">Revenue and expenses, last 6 months</h2>
        <div className="flex h-56 items-end gap-4">
          {report?.months.map((m) => (
            <div
              key={m.month}
              className="flex h-full flex-1 items-end justify-center gap-1.5"
              title={`${monthLabel(m.month, true)}: revenue ${formatCurrency(m.revenue)}, expenses ${formatCurrency(m.expenses)}`}
            >
              <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold text-muted">{formatCompactCurrency(m.revenue)}</span>
                <div style={{ height: `${Math.max((m.revenue / maxAmount) * 80, 2)}%` }} className="w-full rounded-lg bg-brand-600" />
              </div>
              <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold text-muted">{formatCompactCurrency(m.expenses)}</span>
                <div style={{ height: `${Math.max((m.expenses / maxAmount) * 80, 2)}%` }} className="w-full rounded-lg bg-coral" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4">
          {report?.months.map((m) => (
            <span key={m.month} className="flex-1 text-center text-xs font-medium text-muted">{monthLabel(m.month)}</span>
          ))}
        </div>
        <div className="mt-4 flex gap-5 text-sm text-muted">
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-brand-600" /> Revenue</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-coral" /> Expenses</span>
        </div>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[480px] text-left">
          <thead className="bg-canvas text-sm text-muted">
            <tr>
              <th className="px-6 py-3 font-semibold">Month</th>
              <th className="px-6 py-3 font-semibold">Revenue</th>
              <th className="px-6 py-3 font-semibold">Expenses</th>
              <th className="px-6 py-3 font-semibold">Profit</th>
            </tr>
          </thead>
          <tbody>
            {report === null && <tr><td colSpan={4} className="px-6 py-8 text-center text-muted">Loading…</td></tr>}
            {report?.months.slice().reverse().map((m) => (
              <tr key={m.month} className="border-t border-line">
                <td className="px-6 py-3.5 font-medium">{monthLabel(m.month, true)}</td>
                <td className="px-6 py-3.5">{formatCurrency(m.revenue)}</td>
                <td className="px-6 py-3.5">{formatCurrency(m.expenses)}</td>
                <td className={`px-6 py-3.5 font-semibold ${m.profit < 0 ? 'text-red-600' : ''}`}>{formatCurrency(m.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
