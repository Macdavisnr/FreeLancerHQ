import { useEffect, useState } from 'react'
import DocumentsPanel from '@/components/DocumentsPanel'
import PageHeader from '@/components/PageHeader'
import { listClients } from '@/services/clientService'
import { listProjects } from '@/services/projectService'
import type { Client } from '@/types/client'
import type { Project } from '@/types/project'

/*
 * All documents in one place. The "Showing" choice does two jobs: it filters the list, and it is
 * where new uploads are filed (pick a client first, then drop the contract in).
 * Its value is "", "client:<id>" or "project:<id>".
 */
export default function DocumentsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [scope, setScope] = useState('')

  useEffect(() => {
    listClients().then((all) => setClients(all.filter((c) => !c.archived)))
    listProjects().then(setProjects)
  }, [])

  const [kind, scopeId] = scope.split(':')
  const filter = kind === 'client' ? { clientId: scopeId } : kind === 'project' ? { projectId: scopeId } : {}

  return (
    <>
      <PageHeader title="Documents" subtitle="Contracts, briefs, receipts and other files, filed by client and project." />

      <div className="mb-4 max-w-md">
        <label htmlFor="doc-scope" className="mb-1.5 block text-sm font-semibold">Showing (and uploading to)</label>
        <select
          id="doc-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600"
        >
          <option value="">All documents</option>
          {clients.length > 0 && (
            <optgroup label="Clients">
              {clients.map((c) => (
                <option key={c.id} value={`client:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
          )}
          {projects.length > 0 && (
            <optgroup label="Projects">
              {projects.map((p) => (
                <option key={p.id} value={`project:${p.id}`}>{p.name} · {p.clientName}</option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="mt-1.5 text-sm text-muted">New uploads are filed under the client or project chosen here.</p>
      </div>

      <DocumentsPanel filter={filter} showOwner emptyMessage="No documents here yet." />
    </>
  )
}
