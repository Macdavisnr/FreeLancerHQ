import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'
import StringListEditor from '@/components/StringListEditor'
import TextField from '@/components/TextField'
import { CURRENCY_OPTIONS } from '@/lib/currencies'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { listClients } from '@/services/clientService'
import { createProposal, generateProposal, getProposal, updateProposal } from '@/services/proposalService'
import type { Client } from '@/types/client'
import type { GenerateProposalInput, ProposalContent, ProposalInput } from '@/types/proposal'
import { currencySymbol, formatCurrency, getActiveCurrency } from '@/utils/format'

interface FormState {
  clientId: string
  currency: string
  budget: string
  brief: string
  aiGenerated: boolean
  title: string
  summary: string
  scope: string
  deliverables: string[]
  timeline: { phase: string; duration: string; description: string }[]
  pricing: { item: string; amount: string }[]
  questions: string[]
  terms: string
}

const EMPTY: FormState = {
  clientId: '',
  currency: '',
  budget: '',
  brief: '',
  aiGenerated: false,
  title: '',
  summary: '',
  scope: '',
  deliverables: [],
  timeline: [],
  pricing: [],
  questions: [],
  terms: '',
}

const field = 'w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600'
const label = 'mb-1.5 block text-sm font-semibold'
const card = 'mb-4 rounded-2xl border border-line bg-white p-6 shadow-sm'

/** One page for both /proposals/new and /proposals/:id/edit. */
export default function ProposalFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editing = id !== undefined

  const [clients, setClients] = useState<Client[] | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // AI assistant inputs (the description is kept on the proposal as its "brief")
  const [ai, setAi] = useState({ jobTitle: '', requirements: '', timelineHint: '', tone: 'professional' as GenerateProposalInput['tone'] })
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiNotice, setAiNotice] = useState('')

  useEffect(() => {
    async function load() {
      const [allClients, existing] = await Promise.all([listClients(), id ? getProposal(id) : Promise.resolve(null)])
      if (id && !existing) return setNotFound(true)
      setClients(allClients.filter((c) => !c.archived || c.id === existing?.clientId))
      if (existing) {
        setForm({
          clientId: existing.clientId,
          currency: existing.currency,
          budget: existing.budget ? String(existing.budget) : '',
          brief: existing.brief,
          aiGenerated: existing.aiGenerated,
          title: existing.title,
          summary: existing.summary,
          scope: existing.scope,
          deliverables: existing.deliverables,
          timeline: existing.timeline,
          pricing: existing.pricing.map((p) => ({ item: p.item, amount: String(p.amount) })),
          questions: existing.questions,
          terms: existing.terms,
        })
      } else {
        setForm({ ...EMPTY, clientId: searchParams.get('clientId') ?? '', currency: getActiveCurrency() })
      }
    }
    load()
  }, [id, searchParams])

  if (notFound) return <p className="text-muted">Proposal not found.</p>
  if (!form || !clients) return <p className="text-muted">Loading…</p>

  if (clients.length === 0) {
    return (
      <>
        <BackLink to="/proposals" label="Proposals" className="mb-3" />
        <PageHeader title="New proposal" />
        <p className="mb-4 text-muted">A proposal is written for a client, so add a client first.</p>
        <Link to="/clients/new" className={btnPrimary}>Add client</Link>
      </>
    )
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => f && { ...f, [key]: value })
  const pricingTotal = form.pricing.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const budgetNumber = Number(form.budget) || 0
  const hasContent = Boolean(form.summary || form.scope || form.deliverables.length)

  async function handleGenerate() {
    if (hasContent && !window.confirm('Replace the text you have now with a new AI draft?')) return
    setAiError('')
    setAiNotice('')
    setGenerating(true)
    try {
      const draft: ProposalContent = await generateProposal({
        clientId: form!.clientId || null,
        jobTitle: ai.jobTitle || form!.title,
        description: form!.brief,
        requirements: ai.requirements,
        budget: budgetNumber || null,
        currency: form!.currency,
        timelineHint: ai.timelineHint,
        tone: ai.tone,
      })
      setForm((f) => f && {
        ...f,
        aiGenerated: true,
        title: draft.title,
        summary: draft.summary,
        scope: draft.scope,
        deliverables: draft.deliverables,
        timeline: draft.timeline,
        pricing: draft.pricing.map((p) => ({ item: p.item, amount: String(p.amount) })),
        questions: draft.questions,
        terms: draft.terms,
      })
      setAiNotice('Draft written. Read it carefully and edit anything that is not right before you save. The AI does not know your real experience, so add your own details.')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not write the proposal.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const input: ProposalInput = {
      clientId: form!.clientId,
      currency: form!.currency,
      // No budget typed but price lines entered: the budget is simply their total.
      budget: budgetNumber || pricingTotal,
      brief: form!.brief,
      aiGenerated: form!.aiGenerated,
      title: form!.title,
      summary: form!.summary,
      scope: form!.scope,
      deliverables: form!.deliverables.filter((d) => d.trim()),
      timeline: form!.timeline.filter((t) => t.phase.trim()),
      pricing: form!.pricing.filter((p) => p.item.trim()).map((p) => ({ item: p.item, amount: Number(p.amount) || 0 })),
      questions: form!.questions.filter((q) => q.trim()),
      terms: form!.terms,
    }
    try {
      const saved = editing ? await updateProposal(id!, input) : await createProposal(input)
      navigate(`/proposals/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl">
      <BackLink to={editing ? `/proposals/${id}` : '/proposals'} label={editing ? 'Proposal' : 'Proposals'} className="mb-3" />
      <PageHeader title={editing ? 'Edit proposal' : 'New proposal'} subtitle="Describe the job, let the AI draft it, then make it yours." />

      <section className={card}>
        <h2 className="mb-4 font-bold">The job</h2>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <div className="mb-4 sm:col-span-1">
            <label htmlFor="client" className={label}>Client</label>
            <select id="client" required value={form.clientId} onChange={(e) => set('clientId', e.target.value)} className={field}>
              <option value="" disabled>Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label htmlFor="currency" className={label}>Quote in</label>
            <select id="currency" value={form.currency} onChange={(e) => set('currency', e.target.value)} className={field}>
              {CURRENCY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <TextField
            label={`Budget (${currencySymbol(form.currency)})`}
            type="number" min="0" step="any" placeholder="Optional"
            value={form.budget} onChange={(e) => set('budget', e.target.value)}
          />
        </div>
        <label htmlFor="brief" className={label}>Client&apos;s job description</label>
        <textarea
          id="brief" rows={5} value={form.brief} onChange={(e) => set('brief', e.target.value)}
          placeholder="Paste the job post or describe what the client needs…"
          className={field}
        />
      </section>

      <section className="mb-4 rounded-2xl border border-brand-100 bg-brand-50 p-6">
        <div className="mb-1 flex items-center gap-2">
          <span aria-hidden="true">✨</span>
          <h2 className="font-bold text-brand-700">Write it with AI</h2>
        </div>
        <p className="mb-4 text-sm text-brand-700/80">
          Uses the job description and budget above. Nothing is saved until you press Save, and you can edit everything.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField label="Job title" placeholder="e.g. E-commerce website" value={ai.jobTitle} onChange={(e) => setAi({ ...ai, jobTitle: e.target.value })} />
          <TextField label="When you can deliver" placeholder="e.g. 6 weeks" value={ai.timelineHint} onChange={(e) => setAi({ ...ai, timelineHint: e.target.value })} />
        </div>
        <TextField label="Key requirements (optional)" placeholder="e.g. React, payment integration, admin dashboard" value={ai.requirements} onChange={(e) => setAi({ ...ai, requirements: e.target.value })} />
        <div className="mb-4 sm:w-1/2">
          <label htmlFor="tone" className={label}>Tone</label>
          <select id="tone" value={ai.tone} onChange={(e) => setAi({ ...ai, tone: e.target.value as GenerateProposalInput['tone'] })} className={field}>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Short and to the point</option>
          </select>
        </div>
        {aiError && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{aiError}</p>}
        {aiNotice && <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{aiNotice}</p>}
        <button type="button" onClick={handleGenerate} disabled={generating || form.brief.trim().length < 20} className={`${btnPrimary} gap-2.5`}>
          {generating && <Spinner />}
          {generating ? 'Writing your proposal… this can take up to a minute' : hasContent ? 'Write a new draft' : 'Write my proposal'}
        </button>
        {form.brief.trim().length < 20 && <p className="mt-2 text-sm text-brand-700/80">Add the client&apos;s job description above first (at least 20 characters).</p>}
      </section>

      <section className={card}>
        <h2 className="mb-4 font-bold">The proposal</h2>
        <TextField label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} required />

        <label htmlFor="summary" className={label}>Summary</label>
        <textarea id="summary" rows={3} value={form.summary} onChange={(e) => set('summary', e.target.value)} className={`${field} mb-4`} />

        <label htmlFor="scope" className={label}>Scope of work</label>
        <textarea id="scope" rows={5} value={form.scope} onChange={(e) => set('scope', e.target.value)} className={`${field} mb-5`} />

        <StringListEditor label="Deliverables" items={form.deliverables} onChange={(v) => set('deliverables', v)} placeholder="What the client will receive" addLabel="Add deliverable" />

        <div className="mb-5">
          <p className="mb-1.5 text-sm font-semibold">Timeline</p>
          {form.timeline.map((t, i) => (
            <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_130px_2fr_36px]">
              <input aria-label={`Phase ${i + 1}`} placeholder="Phase" value={t.phase} className={field}
                onChange={(e) => set('timeline', form.timeline.map((x, j) => (j === i ? { ...x, phase: e.target.value } : x)))} />
              <input aria-label={`Duration ${i + 1}`} placeholder="Duration" value={t.duration} className={field}
                onChange={(e) => set('timeline', form.timeline.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))} />
              <input aria-label={`Description ${i + 1}`} placeholder="What happens" value={t.description} className={field}
                onChange={(e) => set('timeline', form.timeline.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <button type="button" aria-label={`Remove phase ${i + 1}`} className="px-2 text-muted hover:text-red-600"
                onClick={() => set('timeline', form.timeline.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="text-sm font-semibold text-brand-700"
            onClick={() => set('timeline', [...form.timeline, { phase: '', duration: '', description: '' }])}>+ Add phase</button>
        </div>

        <div className="mb-5">
          <p className="mb-1.5 text-sm font-semibold">Pricing</p>
          {form.pricing.map((p, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_150px_36px] gap-2">
              <input aria-label={`Price item ${i + 1}`} placeholder="Item" value={p.item} className={field}
                onChange={(e) => set('pricing', form.pricing.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
              <input aria-label={`Price amount ${i + 1}`} type="number" min="0" step="any" placeholder="Amount" value={p.amount} className={field}
                onChange={(e) => set('pricing', form.pricing.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" aria-label={`Remove price ${i + 1}`} className="px-2 text-muted hover:text-red-600"
                onClick={() => set('pricing', form.pricing.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="text-sm font-semibold text-brand-700"
            onClick={() => set('pricing', [...form.pricing, { item: '', amount: '' }])}>+ Add price line</button>
          {form.pricing.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              Total: <span className="font-bold text-ink">{formatCurrency(pricingTotal, form.currency)}</span>
              {budgetNumber > 0 && Math.abs(pricingTotal - budgetNumber) > 0.005 && (
                <> · your budget is {formatCurrency(budgetNumber, form.currency)}, so the lines will be adjusted to match it when you save.</>
              )}
              {budgetNumber === 0 && ' · this becomes the proposal budget.'}
            </p>
          )}
        </div>

        <StringListEditor label="Questions for the client" items={form.questions} onChange={(v) => set('questions', v)} placeholder="Something to clarify before you start" addLabel="Add question" />

        <label htmlFor="terms" className={label}>Terms</label>
        <textarea id="terms" rows={3} value={form.terms} onChange={(e) => set('terms', e.target.value)} className={field} />
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className={`${btnPrimary} gap-2.5`}>
          {saving && <Spinner />}
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save proposal'}
        </button>
        <Link to={editing ? `/proposals/${id}` : '/proposals'} className={btnSecondary}>Cancel</Link>
      </div>
    </form>
  )
}
