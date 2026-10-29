import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import TextField from '@/components/TextField'
import { CURRENCY_OPTIONS } from '@/lib/currencies'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { getRate, type Rate } from '@/services/ratesService'
import type { Client } from '@/types/client'
import type { InvoiceInput } from '@/types/invoice'
import type { Project } from '@/types/project'
import { currencySymbol, formatCurrency, getActiveCurrency } from '@/utils/format'

export interface InvoiceFormValues {
  clientId: string
  projectId: string
  issueDate: string
  dueDate: string
  taxRate: string
  /** The currency this invoice is billed in; may differ from the account's home currency. */
  currency: string
  notes: string
  items: { description: string; quantity: string; unitPrice: string }[]
}

interface Props {
  initial: InvoiceFormValues
  clients: Client[]
  projects: Project[]
  /** true once the invoice has been sent: its currency can no longer change */
  currencyLocked?: boolean
  submitLabel: string
  cancelTo: string
  onSubmit: (input: InvoiceInput) => Promise<void>
}

const fieldClass = 'w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600'
const labelClass = 'mb-1.5 block text-sm font-semibold'

/** Shared by "New invoice" and "Edit invoice". */
export default function InvoiceForm({ initial, clients, projects, currencyLocked, submitLabel, cancelTo, onSubmit }: Props) {
  const [values, setValues] = useState(initial)
  const home = getActiveCurrency()
  const foreign = values.currency !== home

  // Today's exchange rate for the chosen currency, so the person sees what the invoice is worth
  // in their own currency. Stored with the currency it belongs to, so a stale answer is never shown.
  const [rate, setRate] = useState<{ currency: string; rate: Rate | null } | null>(null)
  useEffect(() => {
    if (values.currency === home) return
    let cancelled = false
    getRate(values.currency, home)
      .then((r) => !cancelled && setRate({ currency: values.currency, rate: r }))
      .catch(() => !cancelled && setRate({ currency: values.currency, rate: null }))
    return () => {
      cancelled = true
    }
  }, [values.currency, home])
  const currentRate = rate?.currency === values.currency ? rate : null
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (field: keyof Omit<InvoiceFormValues, 'items'>) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  const setItem = (index: number, field: 'description' | 'quantity' | 'unitPrice', value: string) =>
    setValues((v) => ({
      ...v,
      items: v.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }))

  const addItem = () =>
    setValues((v) => ({ ...v, items: [...v.items, { description: '', quantity: '1', unitPrice: '' }] }))
  const removeItem = (index: number) =>
    setValues((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }))

  // This preview is only for display. The server recalculates the real totals when you save.
  const subtotal = values.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
  const tax = (subtotal * (Number(values.taxRate) || 0)) / 100

  const clientProjects = projects.filter((p) => p.clientId === values.clientId)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({
        clientId: values.clientId,
        projectId: values.projectId || null,
        issueDate: values.issueDate,
        dueDate: values.dueDate,
        taxRate: Number(values.taxRate) || 0,
        currency: values.currency,
        notes: values.notes,
        items: values.items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice) || 0,
        })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="mb-4">
          <label htmlFor="client" className={labelClass}>Client</label>
          <select
            id="client"
            required
            value={values.clientId}
            onChange={(e) => setValues((v) => ({ ...v, clientId: e.target.value, projectId: '' }))}
            className={fieldClass}
          >
            <option value="" disabled>Choose a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label htmlFor="project" className={labelClass}>Project (optional)</label>
          <select
            id="project"
            value={values.projectId}
            onChange={set('projectId')}
            disabled={!values.clientId}
            className={fieldClass}
          >
            <option value="">No project</option>
            {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <TextField label="Issue date" type="date" value={values.issueDate} onChange={set('issueDate')} required />
        <TextField label="Due date" type="date" value={values.dueDate} onChange={set('dueDate')} required />
        <div className="mb-4 sm:col-span-2">
          <label htmlFor="invoice-currency" className={labelClass}>Invoice currency</label>
          <select
            id="invoice-currency"
            value={values.currency}
            onChange={set('currency')}
            disabled={currencyLocked}
            className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted`}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}{c.code === home ? ' · your account currency' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-sm text-muted">
            {currencyLocked
              ? 'The currency is fixed because this invoice has been sent.'
              : foreign
                ? 'Your client pays in this currency. It is converted to your account currency when you record each payment.'
                : 'Choose another currency to bill a client abroad in theirs.'}
          </p>
        </div>
      </div>

      <h2 className="mb-2 mt-2 font-bold">Line items</h2>
      <div className="mb-2 hidden grid-cols-[1fr_90px_140px_130px_36px] gap-3 text-sm font-semibold text-muted sm:grid">
        <span>Description</span><span>Qty</span><span>Rate ({currencySymbol(values.currency)})</span><span className="text-right">Amount</span><span />
      </div>
      {values.items.map((item, i) => (
        <div key={i} className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_90px_140px_130px_36px] sm:items-center">
          <input
            aria-label="Description"
            placeholder="Description"
            value={item.description}
            onChange={(e) => setItem(i, 'description', e.target.value)}
            className={`${fieldClass} col-span-2 sm:col-span-1`}
          />
          <input
            aria-label="Quantity"
            type="number" min="0" step="any"
            value={item.quantity}
            onChange={(e) => setItem(i, 'quantity', e.target.value)}
            className={fieldClass}
          />
          <input
            aria-label="Rate"
            type="number" min="0" step="any" placeholder="0"
            value={item.unitPrice}
            onChange={(e) => setItem(i, 'unitPrice', e.target.value)}
            className={fieldClass}
          />
          <span className="text-right font-semibold">
            {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), values.currency)}
          </span>
          <button
            type="button"
            onClick={() => removeItem(i)}
            disabled={values.items.length === 1}
            aria-label="Remove line"
            className="justify-self-end px-2 text-muted hover:text-red-600 disabled:opacity-30 disabled:hover:text-muted"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="mb-6 text-sm font-semibold text-brand-700">
        + Add line
      </button>

      <div className="mb-6 ml-auto w-full max-w-xs space-y-2 border-t border-line pt-4">
        <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatCurrency(subtotal, values.currency)}</span></div>
        <div className="flex items-center justify-between text-muted">
          <span className="flex items-center gap-2">
            Tax
            <input
              aria-label="Tax rate"
              type="number" min="0" max="100" step="any"
              value={values.taxRate}
              onChange={set('taxRate')}
              className="w-20 rounded-lg border border-line px-2 py-1 text-right text-ink outline-none focus:border-brand-600"
            />
            %
          </span>
          <span>{formatCurrency(tax, values.currency)}</span>
        </div>
        <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{formatCurrency(subtotal + tax, values.currency)}</span></div>
      </div>

      {foreign && (
        <div className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          {currentRate === null ? (
            'Checking today’s exchange rate…'
          ) : currentRate.rate ? (
            <>
              <p>
                <span className="font-bold">
                  ≈ {formatCurrency((subtotal + tax) * currentRate.rate.rate, home)}
                </span>{' '}
                in your account currency, at today’s rate of 1 {values.currency} = {currentRate.rate.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {home}.
              </p>
              <p className="mt-1 text-brand-700/80">
                The rate is saved on the invoice when you mark it as sent. Each payment is converted separately.
                {currentRate.rate.stale && ' (Exchange rates could not be refreshed; this is the last known rate.)'}{' '}
                <a href={currentRate.rate.attribution} target="_blank" rel="noreferrer" className="underline">Rates by ExchangeRate-API</a>
              </p>
            </>
          ) : (
            'Exchange rates are unavailable right now, so this invoice cannot be saved in another currency yet. Try again shortly.'
          )}
        </div>
      )}

      <label htmlFor="notes" className={labelClass}>Notes</label>
      <textarea
        id="notes" rows={3}
        value={values.notes}
        onChange={set('notes')}
        className={`${fieldClass} mb-4`}
      />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className={btnPrimary}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <Link to={cancelTo} className={btnSecondary}>Cancel</Link>
      </div>
    </form>
  )
}
