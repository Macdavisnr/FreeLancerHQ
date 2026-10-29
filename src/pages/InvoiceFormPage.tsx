import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import InvoiceForm, { type InvoiceFormValues } from '@/components/InvoiceForm'
import PageHeader from '@/components/PageHeader'
import { btnPrimary } from '@/lib/ui'
import { listClients } from '@/services/clientService'
import { createInvoice, getInvoice, updateInvoice } from '@/services/invoiceService'
import { listProjects } from '@/services/projectService'
import type { Client } from '@/types/client'
import type { InvoiceInput } from '@/types/invoice'
import type { Project } from '@/types/project'
import { getSettings } from '@/services/settingsService'
import { getActiveCurrency, todayISO } from '@/utils/format'

/** One page for both /invoices/new and /invoices/:id/edit. */
export default function InvoiceFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editing = id !== undefined

  const [clients, setClients] = useState<Client[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [initial, setInitial] = useState<InvoiceFormValues | null>(null)
  const [title, setTitle] = useState('New invoice')
  const [notFound, setNotFound] = useState(false)
  const [currencyLocked, setCurrencyLocked] = useState(false)

  useEffect(() => {
    async function load() {
      const [allClients, allProjects, { settings }, existing] = await Promise.all([
        listClients(),
        listProjects(),
        getSettings(),
        id ? getInvoice(id) : Promise.resolve(null),
      ])
      if (id && !existing) {
        setNotFound(true)
        return
      }
      const inv = existing?.invoice
      if (inv) {
        setTitle(`Edit ${inv.reference}`)
        setCurrencyLocked(inv.sentAt !== null) // billed currency is frozen once the invoice is sent
      }
      setClients(allClients.filter((c) => !c.archived || c.id === inv?.clientId))
      setProjects(allProjects)
      setInitial({
        clientId: inv?.clientId ?? searchParams.get('clientId') ?? '',
        projectId: inv?.projectId ?? searchParams.get('projectId') ?? '',
        issueDate: inv?.issueDate ?? todayISO(),
        dueDate: inv?.dueDate ?? todayISO(settings.paymentTermsDays),
        taxRate: String(inv?.taxRate ?? 0),
        currency: inv?.currency ?? getActiveCurrency(),
        notes: inv ? inv.notes : settings.invoiceNote,
        items: existing
          ? existing.items.map((it) => ({
              description: it.description,
              quantity: String(it.quantity),
              unitPrice: String(it.unitPrice),
            }))
          : [{ description: '', quantity: '1', unitPrice: '' }],
      })
    }
    load()
  }, [id, searchParams])

  if (notFound) return <p className="text-muted">Invoice not found.</p>
  if (!initial || !clients) return <p className="text-muted">Loading…</p>

  if (clients.length === 0) {
    return (
      <>
        <BackLink to="/invoices" label="Invoices" className="mb-3" />
        <PageHeader title="New invoice" />
        <p className="mb-4 text-muted">An invoice is billed to a client, so add a client first.</p>
        <Link to="/clients/new" className={btnPrimary}>Add client</Link>
      </>
    )
  }

  async function handleSubmit(input: InvoiceInput) {
    const saved = editing ? await updateInvoice(id!, input) : await createInvoice(input)
    navigate(`/invoices/${saved.invoice.id}`)
  }

  return (
    <>
      <BackLink
        to={editing ? `/invoices/${id}` : '/invoices'}
        label={editing ? title.replace('Edit ', '') : 'Invoices'}
        className="mb-3"
      />
      <PageHeader title={title} />
      <InvoiceForm
        initial={initial}
        clients={clients}
        projects={projects}
        currencyLocked={currencyLocked}
        submitLabel={editing ? 'Save changes' : 'Create invoice'}
        cancelTo={editing ? `/invoices/${id}` : '/invoices'}
        onSubmit={handleSubmit}
      />
    </>
  )
}
