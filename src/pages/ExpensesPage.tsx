import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import { btnPrimary } from '@/lib/ui'
import { deleteExpense, listExpenses } from '@/services/expenseService'
import type { Expense, ExpenseSummary } from '@/types/expense'
import { formatCurrency, formatDate } from '@/utils/format'

export default function ExpensesPage() {
  const [data, setData] = useState<{ expenses: Expense[]; summary: ExpenseSummary } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listExpenses().then(setData)
  }, [])

  async function handleDelete(expense: Expense) {
    if (!window.confirm(`Delete "${expense.description}"?`)) return
    setError('')
    try {
      await deleteExpense(expense.id)
      setData(await listExpenses()) // reload so the summary cards update too
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete expense.')
    }
  }

  const summary = data?.summary

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Know where your money goes."
        action={<Link to="/expenses/new" className={btnPrimary}>Add expense</Link>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="This month"
          value={formatCurrency(summary?.monthTotal ?? 0)}
          note={`${summary?.monthCount ?? 0} expense${summary?.monthCount === 1 ? '' : 's'}`}
          tone="red"
        />
        <StatCard
          label="Largest category"
          value={summary?.largestCategory?.name ?? '—'}
          note={summary?.largestCategory ? formatCurrency(summary.largestCategory.amount) : 'No expenses this month'}
          tone="blue"
        />
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left">
          <thead className="bg-canvas text-sm text-muted">
            <tr>
              <th className="px-6 py-3 font-semibold">Description</th>
              <th className="px-6 py-3 font-semibold">Category</th>
              <th className="px-6 py-3 font-semibold">Date</th>
              <th className="px-6 py-3 font-semibold">Amount</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {data === null && <tr><td colSpan={5} className="px-6 py-8 text-center text-muted">Loading…</td></tr>}
            {data?.expenses.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-muted">No expenses yet. Add your first one.</td></tr>
            )}
            {data?.expenses.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-6 py-4 font-medium">{e.description}</td>
                <td className="px-6 py-4">{e.category}</td>
                <td className="px-6 py-4">{formatDate(e.spentOn)}</td>
                <td className="px-6 py-4">{formatCurrency(e.amount)}</td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold">
                  <Link to={`/expenses/${e.id}/edit`} className="mr-4 text-brand-700">Edit</Link>
                  <button onClick={() => handleDelete(e)} className="text-red-600">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
