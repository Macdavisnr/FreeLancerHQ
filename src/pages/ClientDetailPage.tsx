import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DocumentsPanel from '@/components/DocumentsPanel'
import InvoicesTable from '@/components/InvoicesTable'
import PageHeader from '@/components/PageHeader'
import BackLink from '@/components/BackLink'
import ProjectsTable from '@/components/ProjectsTable'
import StatCard from '@/components/StatCard'
import { btnDanger, btnPrimary, btnSecondary } from '@/lib/ui'
import { getClient, setClientArchived } from '@/services/clientService'
import { listInvoices } from '@/services/invoiceService'
import { listProjects } from '@/services/projectService'
import type { Client } from '@/types/client'
import type { Invoice } from '@/types/invoice'
import type { Project } from '@/types/project'
import { formatCurrency, formatMonthYear } from '@/utils/format'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-semibold">{value || '—'}</p>
    </div>
  )
}

export default function ClientDetailPage() {
  const { id } = useParams()
  const [client, setClient] = useState<Client | null | undefined>(undefined) // undefined = loading

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)

  useEffect(() => {
    if (!id) return
    getClient(id).then(setClient)
    listProjects(id).then(setProjects)
    listInvoices({ clientId: id }).then((d) => setInvoices(d.invoices))
  }, [id])

  if (client === undefined) return <p className="text-muted">Loading…</p>
  if (client === null) {
    return (
      <>
        <p className="mb-4 text-muted">Client not found.</p>
        <Link to="/clients" className={btnSecondary}>Back to clients</Link>
      </>
    )
  }

  async function toggleArchive() {
    setClient(await setClientArchived(client!.id, !client!.archived))
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">
        <BackLink to="/clients" label="Clients" />
        <span>/</span>
        <span>{client.name}</span>
      </div>
      <PageHeader
        title={client.name}
        subtitle={client.archived ? 'Archived client' : 'Client profile'}
        action={
          <div className="flex flex-wrap gap-3">
            <button onClick={toggleArchive} className={client.archived ? btnSecondary : btnDanger}>
              {client.archived ? 'Restore' : 'Archive'}
            </button>
            <Link to={`/clients/${client.id}/edit`} className={btnSecondary}>Edit client</Link>
            <Link to={`/projects/new?clientId=${client.id}`} className={btnPrimary}>New project</Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total billed"
          value={formatCurrency(client.totalBilled)}
          note={`${client.invoiceCount} invoice${client.invoiceCount === 1 ? '' : 's'}`}
          tone="green"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(client.outstanding)}
          note={client.outstanding > 0 ? 'Awaiting payment' : 'Nothing due'}
          tone="amber"
        />
        <StatCard
          label="Projects"
          value={String(projects?.length ?? 0)}
          note={`${client.activeProjects} active`}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section>
            <h2 className="mb-2 font-bold">Projects</h2>
            <ProjectsTable
              projects={projects}
              showClient={false}
              emptyMessage={`No projects for ${client.name} yet.`}
            />
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">Invoices</h2>
              <Link to={`/invoices/new?clientId=${client.id}`} className="text-sm font-semibold text-brand-700">
                + New invoice
              </Link>
            </div>
            <InvoicesTable
              invoices={invoices}
              showClient={false}
              emptyMessage={`No invoices for ${client.name} yet.`}
            />
          </section>
          <DocumentsPanel
            filter={{ clientId: client.id }}
            showOwner
            emptyMessage={`No documents for ${client.name} yet.`}
          />
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold">Contact</h2>
            <Field label="Email" value={client.email} />
            <Field label="Phone" value={client.phone} />
            <Field label="Company" value={client.company} />
            <Field label="Address" value={client.address} />
            <Field label="Client since" value={formatMonthYear(client.createdAt)} />
          </section>
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-bold">Notes</h2>
            <p className="text-muted">{client.notes || 'No notes yet.'}</p>
          </section>
        </div>
      </div>
    </>
  )
}
