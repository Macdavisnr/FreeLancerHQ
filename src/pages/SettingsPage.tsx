import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import PageHeader from '@/components/PageHeader'
import PaystackCard from '@/components/PaystackCard'
import TextField from '@/components/TextField'
import { useCurrency } from '@/hooks/useCurrency'
import { CURRENCY_OPTIONS } from '@/lib/currencies'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { getSettings, saveSettings } from '@/services/settingsService'
import type { Settings } from '@/types/settings'

const selectClass = 'w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600'

const PAYMENT_TERMS = [
  { days: 0, label: 'Due on receipt' },
  { days: 7, label: 'Due in 7 days' },
  { days: 14, label: 'Due in 14 days' },
  { days: 30, label: 'Due in 30 days' },
  { days: 60, label: 'Due in 60 days' },
]

const NOTIFICATIONS: { key: keyof Settings; label: string }[] = [
  { key: 'notifyInvoicePaid', label: 'Email me when an invoice is paid' },
  { key: 'notifyOverdue', label: 'Remind me about overdue invoices' },
  { key: 'notifyWeekly', label: 'Weekly business summary' },
  { key: 'remindClientsOverdue', label: 'Email my clients a polite reminder when their invoice is overdue' },
  { key: 'notifyProduct', label: 'Product updates' },
]

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h2 className="font-bold">{title}</h2>
      <p className="mb-4 text-muted">{subtitle}</p>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const { changeCurrency } = useCurrency()
  const [saved, setSaved] = useState<Settings | null>(null)
  const [locked, setLocked] = useState(false) // account currency can't change once money data exists
  const [values, setValues] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getSettings().then(({ settings, currencyLocked }) => {
      setSaved(settings)
      setValues(settings)
      setLocked(currencyLocked)
    })
  }, [])

  if (!values || !saved) return <p className="text-muted">Loading…</p>

  const setText = (field: keyof Settings) => (e: { target: { value: string } }) => {
    setNotice('')
    setValues((v) => v && { ...v, [field]: e.target.value })
  }
  const setFlag = (field: keyof Settings, checked: boolean) => {
    setNotice('')
    setValues((v) => v && { ...v, [field]: checked })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const result = await saveSettings(values!)
      setSaved(result.settings)
      setValues(result.settings)
      setLocked(result.currencyLocked)
      setNotice('Settings saved.')
      if (result.settings.currency !== saved!.currency) changeCurrency(result.settings.currency)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveButton = (
    <button type="submit" disabled={submitting} className={btnPrimary}>
      {submitting ? 'Saving…' : 'Save changes'}
    </button>
  )

  return (
    <>
      <form onSubmit={handleSubmit}>
        <PageHeader title="Settings" subtitle="Manage your business and app preferences." action={saveButton} />

        <div className="max-w-5xl space-y-4">
          <Card title="Business details" subtitle="Shown on your invoices and proposals.">
            <div className="grid gap-x-4 sm:grid-cols-3">
              <TextField label="Business name" value={values.businessName} onChange={setText('businessName')} />
              <TextField label="Business email" type="email" value={values.businessEmail} onChange={setText('businessEmail')} />
              <TextField label="Phone" type="tel" value={values.businessPhone} onChange={setText('businessPhone')} />
            </div>
            <div className="mb-4 sm:w-1/2">
              <label htmlFor="currency" className="mb-1.5 block text-sm font-semibold">Account currency</label>
              <select
                id="currency"
                value={values.currency}
                onChange={setText('currency')}
                disabled={locked}
                className={`${selectClass} disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted`}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-sm text-muted">
                {locked
                  ? 'Locked: your dashboard, reports, expenses and budgets are in this currency, so it cannot change once you have invoices, payments, expenses or projects.'
                  : 'Your dashboard, reports, expenses and project budgets use this currency. You can still invoice clients in any currency. It locks once you add invoices, payments, expenses or projects.'}
              </p>
            </div>
            <TextField label="Address" value={values.businessAddress} onChange={setText('businessAddress')} />
          </Card>

          <Card title="Invoice defaults" subtitle="Applied to every new invoice.">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <TextField label="Invoice prefix" value={values.invoicePrefix} onChange={setText('invoicePrefix')} maxLength={10} required />
              <div className="mb-4">
                <label htmlFor="terms" className="mb-1.5 block text-sm font-semibold">Payment terms</label>
                <select
                  id="terms"
                  value={values.paymentTermsDays}
                  onChange={(e) => {
                    setNotice('')
                    setValues((v) => v && { ...v, paymentTermsDays: Number(e.target.value) })
                  }}
                  className={selectClass}
                >
                  {PAYMENT_TERMS.map((t) => <option key={t.days} value={t.days}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-semibold">Default invoice note</label>
            <textarea id="note" rows={3} value={values.invoiceNote} onChange={setText('invoiceNote')} className={selectClass} />
            <p className="mt-2 text-sm text-muted">
              A new prefix only applies to invoices you create from now on. Existing invoices keep their number.
            </p>
          </Card>

          <Card title="Notifications" subtitle="Choose what is emailed. Everything also appears under the bell at the top of the app. Overdue reminders go out 1, 7, 14 and 30 days after the due date.">
            <ul>
              {NOTIFICATIONS.map(({ key, label }) => (
                <li key={key} className="border-t border-line first:border-0">
                  <label className="flex cursor-pointer items-center justify-between py-3">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={values[key] as boolean}
                      onChange={(e) => setFlag(key, e.target.checked)}
                      className="h-5 w-5 accent-brand-600"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm font-semibold text-emerald-700">{notice}</p>}
          <div className="flex gap-3">
            {saveButton}
            <button type="button" onClick={() => { setValues(saved); setError(''); setNotice('') }} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      </form>

      {/* Its own form (forms can't be nested), saved separately from the settings above. */}
      <div className="mt-4">
        <PaystackCard />
      </div>
    </>
  )
}
