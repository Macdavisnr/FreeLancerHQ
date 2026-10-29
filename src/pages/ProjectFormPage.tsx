import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import BackLink from '@/components/BackLink'
import { STATUS_LABELS } from '@/lib/project-status'
import TextField from '@/components/TextField'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { listClients } from '@/services/clientService'
import { createProject, getProject, updateProject } from '@/services/projectService'
import type { Client } from '@/types/client'
import type { ProjectStatus } from '@/types/project'
import { currencySymbol } from '@/utils/format'

const selectClass =
  'mb-4 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600'

interface FormValues {
  clientId: string
  name: string
  status: ProjectStatus
  budget: string
  startDate: string
  deadline: string
  description: string
}

/** One page for both /projects/new and /projects/:id/edit. */
export default function ProjectFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editing = id !== undefined

  const [clients, setClients] = useState<Client[] | null>(null)
  const [values, setValues] = useState<FormValues | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const [allClients, existing] = await Promise.all([
        listClients(),
        id ? getProject(id) : Promise.resolve(null),
      ])
      if (id && !existing) {
        setNotFound(true)
        return
      }
      const p = existing?.project
      // Archived clients can't get new projects, but keep the current one when editing.
      setClients(allClients.filter((c) => !c.archived || c.id === p?.clientId))
      setValues({
        clientId: p?.clientId ?? searchParams.get('clientId') ?? '',
        name: p?.name ?? '',
        status: p?.status ?? 'not_started',
        budget: p ? String(p.budget) : '',
        startDate: p?.startDate ?? '',
        deadline: p?.deadline ?? '',
        description: p?.description ?? '',
      })
    }
    load()
  }, [id, searchParams])

  if (notFound) return <p className="text-muted">Project not found.</p>
  if (!values || !clients) return <p className="text-muted">Loading…</p>

  if (clients.length === 0) {
    return (
      <>
        <BackLink to="/projects" label="Projects" className="mb-3" />
        <PageHeader title="New project" />
        <p className="mb-4 text-muted">A project belongs to a client, so add a client first.</p>
        <Link to="/clients/new" className={btnPrimary}>Add client</Link>
      </>
    )
  }

  const set = (field: keyof FormValues) => (e: { target: { value: string } }) =>
    setValues((v) => v && { ...v, [field]: e.target.value })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const input = {
      clientId: values!.clientId,
      name: values!.name,
      description: values!.description,
      status: values!.status,
      budget: Number(values!.budget || 0),
      startDate: values!.startDate || null,
      deadline: values!.deadline || null,
    }
    try {
      const saved = editing ? await updateProject(id!, input) : await createProject(input)
      navigate(`/projects/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <BackLink
        to={editing ? `/projects/${id}` : '/projects'}
        label={editing ? values.name : 'Projects'}
        className="mb-3"
      />
      <PageHeader title={editing ? 'Edit project' : 'New project'} subtitle={editing ? values.name : undefined} />
      <form onSubmit={handleSubmit} className="max-w-3xl rounded-2xl border border-line bg-white p-6 shadow-sm">
        <TextField label="Project name" value={values.name} onChange={set('name')} required />

        <div className="grid gap-x-4 sm:grid-cols-2">
          <div>
            <label htmlFor="client" className="mb-1.5 block text-sm font-semibold">Client</label>
            <select id="client" value={values.clientId} onChange={set('clientId')} className={selectClass} required>
              <option value="" disabled>Choose a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-semibold">Status</label>
            <select id="status" value={values.status} onChange={set('status')} className={selectClass}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <TextField label={`Budget (${currencySymbol()})`} type="number" min="0" step="any" value={values.budget} onChange={set('budget')} />
          <div className="hidden sm:block" />
          <TextField label="Start date" type="date" value={values.startDate} onChange={set('startDate')} />
          <TextField label="Deadline" type="date" value={values.deadline} onChange={set('deadline')} />
        </div>

        <label htmlFor="description" className="mb-1.5 block text-sm font-semibold">Description</label>
        <textarea
          id="description"
          rows={4}
          value={values.description}
          onChange={set('description')}
          className="mb-4 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className={btnPrimary}>
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
          </button>
          <Link to={editing ? `/projects/${id}` : '/projects'} className={btnSecondary}>Cancel</Link>
        </div>
      </form>
    </>
  )
}
