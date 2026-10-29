import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { btnPrimary } from '@/lib/ui'
import { listClients } from '@/services/clientService'
import type { Client } from '@/types/client'
import { formatCurrency } from '@/utils/format'

export default function ClientsPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    listClients().then(setClients)
  }, [])

  const visible = clients?.filter((c) => c.archived === showArchived) ?? []

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Everyone you work with, in one place."
        action={
          <Link to="/clients/new" className={btnPrimary}>
            Add client
          </Link>
        }
      />

      <div className="mb-3 flex gap-2 text-sm font-semibold">
        {[false, true].map((archived) => (
          <button
            key={String(archived)}
            onClick={() => setShowArchived(archived)}
            className={`rounded-full px-4 py-1.5 ${
              showArchived === archived ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-white'
            }`}
          >
            {archived ? 'Archived' : 'Active'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-canvas text-sm text-muted">
            <tr>
              <th className="px-6 py-3 font-semibold">Client</th>
              <th className="px-6 py-3 font-semibold">Email</th>
              <th className="px-6 py-3 font-semibold">Active projects</th>
              <th className="px-6 py-3 font-semibold">Total billed</th>
            </tr>
          </thead>
          <tbody>
            {clients === null && (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {clients !== null && visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted">
                  {showArchived ? 'No archived clients.' : 'No clients yet. Add your first one.'}
                </td>
              </tr>
            )}
            {visible.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/clients/${c.id}`)}
                className="cursor-pointer border-t border-line hover:bg-canvas"
              >
                <td className="px-6 py-4 font-medium">
                  <Link to={`/clients/${c.id}`}>{c.name}</Link>
                </td>
                <td className="px-6 py-4">{c.email}</td>
                <td className="px-6 py-4">{c.activeProjects}</td>
                <td className="px-6 py-4">{formatCurrency(c.totalBilled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
