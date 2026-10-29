import { STATUS_LABELS } from '@/lib/project-status'
import type { ProjectStatus } from '@/types/project'

const STATUS_STYLES: Record<ProjectStatus, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-sky-100 text-sky-700',
  review: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-700',
}

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
