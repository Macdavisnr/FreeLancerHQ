import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import { useAuth } from '@/hooks/useAuth'
import { btnPrimary } from '@/lib/ui'
import { getDashboard } from '@/services/dashboardService'
import type { Dashboard } from '@/types/dashboard'
import { daysUntil, formatCompactCurrency, formatCurrency, formatDate } from '@/utils/format'

/** Percentage change from `previous` to `current`, e.g. 42.8 or -12.5. null when there is no baseline. */
function percentChange(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`
}

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

/** 'Today', 'Tomorrow', 'Friday' (within a week), otherwise '24 Oct 2026'. */
function relativeDay(date: string) {
  const days = daysUntil(date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' })
  }
  return formatDate(date)
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Same colours as the calendar, so an item looks the same everywhere. */
const UPCOMING_DOT: Record<Dashboard['upcoming'][number]['kind'], string> = {
  event: 'bg-brand-600',
  task: 'bg-emerald-500',
  project: 'bg-sky-500',
  invoice: 'bg-sun',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the dashboard.'))
  }, [])

  const months = data?.revenueByMonth ?? []
  const current = months[months.length - 1]
  const previous = months[months.length - 2]
  const growth = data ? percentChange(data.revenueThisMonth, data.revenueLastMonth) : null
  const maxAmount = Math.max(1, ...months.map((m) => m.amount))

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name}`}
        subtitle="Here is how your business is doing today."
        action={<Link to="/invoices/new" className={btnPrimary}>New invoice</Link>}
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatCurrency(data?.revenueThisMonth ?? 0)}
          note={growth === null ? 'Received this month' : `${formatPercent(growth)} vs last month`}
          tone="green"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(data?.outstanding ?? 0)}
          note={`${data?.outstandingCount ?? 0} unpaid invoice${data?.outstandingCount === 1 ? '' : 's'}`}
          tone="amber"
        />
        <StatCard
          label="Active projects"
          value={String(data?.activeProjects ?? 0)}
          note={`${data?.projectsDueThisWeek ?? 0} due this week`}
          tone="blue"
        />
        <StatCard label="Expenses" value={formatCurrency(data?.expensesThisMonth ?? 0)} note="This month" tone="red" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Revenue, last 6 months</h2>
            {growth !== null && previous && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  growth >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {growth >= 0 ? '▲' : '▼'} {formatPercent(growth)} vs {monthLabel(previous.month)}
              </span>
            )}
          </div>

          <div className="flex h-48 items-end gap-3">
            {months.map((m, i) => {
              const isLatest = m === current
              const change = i > 0 ? percentChange(m.amount, months[i - 1].amount) : null
              return (
                <div
                  key={m.month}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={`${monthLabel(m.month)}: ${formatCurrency(m.amount)}${change === null ? '' : ` (${formatPercent(change)} vs previous month)`}`}
                >
                  <span className={`text-xs font-semibold ${isLatest ? 'text-brand-700' : 'text-muted'}`}>
                    {formatCompactCurrency(m.amount)}
                  </span>
                  <div
                    style={{ height: `${Math.max((m.amount / maxAmount) * 78, 2)}%` }}
                    className={`w-full rounded-lg ${isLatest ? 'bg-brand-600' : 'bg-brand-100'}`}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex gap-3">
            {months.map((m) => (
              <span key={m.month} className="flex-1 text-center text-xs font-medium text-muted">
                {monthLabel(m.month)}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Upcoming</h2>
            <Link to="/calendar" className="text-sm font-semibold text-brand-700">Calendar</Link>
          </div>
          {data && data.upcoming.length === 0 && (
            <p className="text-muted">Nothing due in the next 14 days.</p>
          )}
          <ul className="space-y-3">
            {data?.upcoming.map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${UPCOMING_DOT[item.kind]}`} />
                <span className="flex-1">
                  {item.kind === 'project' ? `Project deadline: ${item.label}` : item.label}
                </span>
                <span className="text-muted">
                  {relativeDay(item.date)}
                  {item.time && `, ${item.time}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
