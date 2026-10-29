import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import PageHeader from '@/components/PageHeader'
import TextField from '@/components/TextField'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { createExpense, getExpense, updateExpense } from '@/services/expenseService'
import { currencySymbol, todayISO } from '@/utils/format'

const CATEGORIES = ['Workspace', 'Software', 'Utilities', 'Hosting', 'Equipment', 'Marketing', 'Travel', 'Other']

interface FormValues {
  description: string
  category: string
  amount: string
  spentOn: string
}

/** One page for both /expenses/new and /expenses/:id/edit. */
export default function ExpenseFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = id !== undefined

  const [values, setValues] = useState<FormValues | null>(
    editing ? null : { description: '', category: 'Workspace', amount: '', spentOn: todayISO() },
  )
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    getExpense(id).then((e) => {
      if (!e) return setNotFound(true)
      setValues({ description: e.description, category: e.category, amount: String(e.amount), spentOn: e.spentOn })
    })
  }, [id])

  if (notFound) return <p className="text-muted">Expense not found.</p>
  if (!values) return <p className="text-muted">Loading…</p>

  const set = (field: keyof FormValues) => (e: { target: { value: string } }) =>
    setValues((v) => v && { ...v, [field]: e.target.value })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const input = {
      description: values!.description,
      category: values!.category,
      amount: Number(values!.amount),
      spentOn: values!.spentOn,
    }
    try {
      if (editing) await updateExpense(id!, input)
      else await createExpense(input)
      navigate('/expenses')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <BackLink to="/expenses" label="Expenses" className="mb-3" />
      <PageHeader title={editing ? 'Edit expense' : 'Add expense'} />
      <form onSubmit={handleSubmit} className="max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-sm">
        <TextField label="Description" value={values.description} onChange={set('description')} required />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="mb-4">
            <label htmlFor="category" className="mb-1.5 block text-sm font-semibold">Category</label>
            <select
              id="category"
              value={values.category}
              onChange={set('category')}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600"
            >
              {/* keep an old custom category selectable when editing */}
              {[...new Set([...CATEGORIES, values.category])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <TextField label={`Amount (${currencySymbol()})`} type="number" min="0" step="any" value={values.amount} onChange={set('amount')} required />
          <TextField label="Date" type="date" value={values.spentOn} onChange={set('spentOn')} required />
        </div>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className={btnPrimary}>
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
          </button>
          <Link to="/expenses" className={btnSecondary}>Cancel</Link>
        </div>
      </form>
    </>
  )
}
