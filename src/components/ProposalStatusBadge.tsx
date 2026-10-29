import type { ProposalStatus } from '@/types/proposal'

const STYLES: Record<ProposalStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-brand-50 text-brand-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
}

const LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
}

export default function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
