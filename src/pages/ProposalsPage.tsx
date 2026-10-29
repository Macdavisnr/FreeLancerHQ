import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import ProposalStatusBadge from '@/components/ProposalStatusBadge'
import { btnPrimary } from '@/lib/ui'
import { listProposals } from '@/services/proposalService'
import type { Proposal } from '@/types/proposal'
import { formatCurrency, formatDate } from '@/utils/format'

export default function ProposalsPage() {
  const navigate = useNavigate()
  const [proposals, setProposals] = useState<Proposal[] | null>(null)

  useEffect(() => {
    listProposals().then(setProposals)
  }, [])

  return (
    <>
      <PageHeader
        title="Proposals"
        subtitle="Win the work before it starts."
        action={<Link to="/proposals/new" className={btnPrimary}>New proposal</Link>}
      />

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[600px] text-left">
          <thead className="bg-canvas text-sm text-muted">
            <tr>
              <th className="px-6 py-3 font-semibold">Proposal</th>
              <th className="px-6 py-3 font-semibold">Client</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Budget</th>
              <th className="px-6 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {proposals === null && <tr><td colSpan={5} className="px-6 py-8 text-center text-muted">Loading…</td></tr>}
            {proposals?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted">
                  No proposals yet. Paste a job description and let the AI write your first draft.
                </td>
              </tr>
            )}
            {proposals?.map((p) => (
              <tr key={p.id} onClick={() => navigate(`/proposals/${p.id}`)} className="cursor-pointer border-t border-line hover:bg-canvas">
                <td className="px-6 py-4 font-medium">
                  <Link to={`/proposals/${p.id}`}>{p.title}</Link>
                </td>
                <td className="px-6 py-4">{p.clientName}</td>
                <td className="px-6 py-4"><ProposalStatusBadge status={p.status} /></td>
                <td className="px-6 py-4">{p.budget > 0 ? formatCurrency(p.budget, p.currency) : '—'}</td>
                <td className="px-6 py-4">{formatDate(p.updatedAt.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
