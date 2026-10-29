import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import ProposalStatusBadge from '@/components/ProposalStatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { btnDanger, btnPrimary, btnSecondary } from '@/lib/ui'
import { convertProposal, deleteProposal, getProposal, setProposalStatus } from '@/services/proposalService'
import type { Proposal, ProposalStatus } from '@/types/proposal'
import { formatCurrency, formatDate } from '@/utils/format'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-700">{title}</h2>
      {children}
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  )
}

export default function ProposalDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [proposal, setProposal] = useState<Proposal | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (id) getProposal(id).then(setProposal)
  }, [id])

  if (proposal === undefined) return <p className="text-muted">Loading…</p>
  if (proposal === null) {
    return (
      <>
        <p className="mb-4 text-muted">Proposal not found.</p>
        <Link to="/proposals" className={btnSecondary}>Back to proposals</Link>
      </>
    )
  }

  const p = proposal
  const money = (n: number) => formatCurrency(n, p.currency)
  const total = p.pricing.reduce((sum, line) => sum + line.amount, 0)

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = (status: ProposalStatus) => run(async () => setProposal(await setProposalStatus(p.id, status)))

  const handleDelete = () => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return
    return run(async () => {
      await deleteProposal(p.id)
      navigate('/proposals', { replace: true })
    })
  }

  const handleConvert = () =>
    run(async () => {
      const { projectId } = await convertProposal(p.id)
      navigate(`/projects/${projectId}`)
    })

  return (
    <>
      <div className="print:hidden"><BackLink to="/proposals" label="Proposals" className="mb-2" /></div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">{p.title}</h1>
            <ProposalStatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-muted">For {p.clientName}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => window.print()} className={btnSecondary}>Download PDF</button>
          {(p.status === 'draft' || p.status === 'sent') && <Link to={`/proposals/${p.id}/edit`} className={btnSecondary}>Edit</Link>}
          {p.status === 'draft' && (
            <>
              <button disabled={busy} onClick={handleDelete} className={btnDanger}>Delete</button>
              <button disabled={busy} onClick={() => changeStatus('sent')} className={btnPrimary}>Mark as sent</button>
            </>
          )}
          {p.status === 'sent' && (
            <>
              <button disabled={busy} onClick={() => changeStatus('declined')} className={btnDanger}>Declined</button>
              <button disabled={busy} onClick={() => changeStatus('accepted')} className={btnPrimary}>Client accepted</button>
            </>
          )}
          {p.status === 'declined' && (
            <>
              <button disabled={busy} onClick={handleDelete} className={btnDanger}>Delete</button>
              <button disabled={busy} onClick={() => changeStatus('draft')} className={btnSecondary}>Reopen as draft</button>
            </>
          )}
          {p.status === 'accepted' && !p.projectId && (
            <button disabled={busy} onClick={handleConvert} className={btnPrimary}>Create project</button>
          )}
          {p.projectId && <Link to={`/projects/${p.projectId}`} className={btnPrimary}>View project</Link>}
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">{error}</p>}
      {p.status === 'draft' && (
        <p className="mb-4 text-sm text-muted print:hidden">
          To send it, use <span className="font-semibold">Download PDF</span> and email it to {p.clientName}, then mark it as sent. Sending by email from here is coming.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-8 shadow-sm lg:col-span-2">
          <header className="mb-8 border-b border-line pb-6">
            <h1 className="text-2xl font-extrabold tracking-tight">{p.title}</h1>
            <p className="mt-2 text-muted">
              Prepared for <span className="font-semibold text-ink">{p.clientName}</span> by{' '}
              <span className="font-semibold text-ink">{user?.name}</span> · {formatDate(p.createdAt.slice(0, 10))}
            </p>
          </header>

          {p.summary && <Section title="Summary"><p className="whitespace-pre-line">{p.summary}</p></Section>}
          {p.scope && <Section title="Scope of work"><p className="whitespace-pre-line">{p.scope}</p></Section>}

          {p.deliverables.length > 0 && (
            <Section title="Deliverables">
              <ul className="list-disc space-y-1 pl-5">
                {p.deliverables.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </Section>
          )}

          {p.timeline.length > 0 && (
            <Section title="Timeline">
              <ol className="space-y-3">
                {p.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                    <div>
                      <p className="font-semibold">{t.phase}{t.duration && <span className="font-normal text-muted"> · {t.duration}</span>}</p>
                      {t.description && <p className="text-muted">{t.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {p.pricing.length > 0 && (
            <Section title="Investment">
              <table className="w-full text-left">
                <tbody>
                  {p.pricing.map((line, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2.5">{line.item}</td>
                      <td className="py-2.5 text-right">{money(line.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-3 font-extrabold">Total</td>
                    <td className="py-3 text-right text-lg font-extrabold">{money(total)}</td>
                  </tr>
                </tbody>
              </table>
            </Section>
          )}

          {p.questions.length > 0 && (
            <Section title="To confirm before we start">
              <ul className="list-disc space-y-1 pl-5">
                {p.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Section>
          )}

          {p.terms && <Section title="Terms"><p className="whitespace-pre-line">{p.terms}</p></Section>}
        </article>

        <aside className="space-y-4 print:hidden">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-bold">Details</h2>
            <DetailRow label="Status"><ProposalStatusBadge status={p.status} /></DetailRow>
            <DetailRow label="Client"><Link to={`/clients/${p.clientId}`} className="text-brand-700">{p.clientName}</Link></DetailRow>
            <DetailRow label="Budget">{p.budget > 0 ? money(p.budget) : '—'}</DetailRow>
            <DetailRow label="Created">{formatDate(p.createdAt.slice(0, 10))}</DetailRow>
            {p.sentAt && <DetailRow label="Sent">{formatDate(p.sentAt.slice(0, 10))}</DetailRow>}
            {p.respondedAt && <DetailRow label={p.status === 'accepted' ? 'Accepted' : 'Declined'}>{formatDate(p.respondedAt.slice(0, 10))}</DetailRow>}
            {p.projectName && <DetailRow label="Project"><Link to={`/projects/${p.projectId}`} className="text-brand-700">{p.projectName}</Link></DetailRow>}
            {p.aiGenerated && <p className="mt-3 text-xs text-muted">✨ First draft written with AI and edited by you.</p>}
          </section>

          {p.brief && (
            <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="mb-2 font-bold">Client&apos;s brief</h2>
              <p className="whitespace-pre-line text-sm text-muted">{p.brief}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
