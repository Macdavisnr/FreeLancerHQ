import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import TextField from '@/components/TextField'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import type { ClientInput } from '@/types/client'

const EMPTY: ClientInput = { name: '', email: '', phone: '', company: '', address: '', notes: '' }

interface Props {
  initial?: ClientInput
  submitLabel: string
  cancelTo: string
  onSubmit: (input: ClientInput) => Promise<void>
}

/** Shared by "Add client" and "Edit client". */
export default function ClientForm({ initial = EMPTY, submitLabel, cancelTo, onSubmit }: Props) {
  const [values, setValues] = useState<ClientInput>(initial)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (field: keyof ClientInput) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({ ...values, name: values.name.trim(), email: values.email.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField label="Client name" value={values.name} onChange={set('name')} required />
        <TextField label="Company" value={values.company} onChange={set('company')} />
        <TextField label="Email" type="email" value={values.email} onChange={set('email')} required />
        <TextField label="Phone" type="tel" value={values.phone} onChange={set('phone')} />
      </div>
      <TextField label="Address" value={values.address} onChange={set('address')} />

      <label htmlFor="notes" className="mb-1.5 block text-sm font-semibold">Notes</label>
      <textarea
        id="notes"
        rows={4}
        value={values.notes}
        onChange={set('notes')}
        className="mb-4 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600"
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
