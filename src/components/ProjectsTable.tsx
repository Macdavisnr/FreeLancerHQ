import { Link, useNavigate } from 'react-router-dom'
import StatusBadge from '@/components/StatusBadge'
import type { Project } from '@/types/project'
import { formatCurrency, formatDate } from '@/utils/format'

interface Props {
  projects: Project[] | null // null = still loading
  emptyMessage: string
  /** The client column is redundant on a client's own page. */
  showClient?: boolean
}

export default function ProjectsTable({ projects, emptyMessage, showClient = true }: Props) {
  const navigate = useNavigate()
  const columns = showClient ? 5 : 4

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-left">
        <thead className="bg-canvas text-sm text-muted">
          <tr>
            <th className="px-6 py-3 font-semibold">Project</th>
            {showClient && <th className="px-6 py-3 font-semibold">Client</th>}
            <th className="px-6 py-3 font-semibold">Status</th>
            <th className="px-6 py-3 font-semibold">Deadline</th>
            <th className="px-6 py-3 font-semibold">Budget</th>
          </tr>
        </thead>
        <tbody>
          {projects === null && (
            <tr><td colSpan={columns} className="px-6 py-8 text-center text-muted">Loading…</td></tr>
          )}
          {projects?.length === 0 && (
            <tr><td colSpan={columns} className="px-6 py-8 text-center text-muted">{emptyMessage}</td></tr>
          )}
          {projects?.map((p) => (
            <tr
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="cursor-pointer border-t border-line hover:bg-canvas"
            >
              <td className="px-6 py-4 font-medium">
                <Link to={`/projects/${p.id}`}>{p.name}</Link>
              </td>
              {showClient && <td className="px-6 py-4">{p.clientName}</td>}
              <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
              <td className="px-6 py-4">{formatDate(p.deadline)}</td>
              <td className="px-6 py-4">{formatCurrency(p.budget)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
