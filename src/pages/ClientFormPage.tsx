import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ClientForm from '@/components/ClientForm'
import PageHeader from '@/components/PageHeader'
import BackLink from '@/components/BackLink'
import { createClient, getClient, updateClient } from '@/services/clientService'
import type { Client, ClientInput } from '@/types/client'

/** One page for both /clients/new and /clients/:id/edit. */
export default function ClientFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = id !== undefined

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(editing)

  useEffect(() => {
    if (!id) return
    getClient(id).then((c) => {
      setClient(c)
      setLoading(false)
    })
  }, [id])

  if (loading) return <p className="text-muted">Loading…</p>
  if (editing && !client) return <p className="text-muted">Client not found.</p>

  async function handleSubmit(input: ClientInput) {
    const saved = editing ? await updateClient(id!, input) : await createClient(input)
    navigate(`/clients/${saved.id}`)
  }

  return (
    <>
      <BackLink
        to={editing ? `/clients/${id}` : '/clients'}
        label={editing ? client!.name : 'Clients'}
        className="mb-3"
      />
      <PageHeader
        title={editing ? 'Edit client' : 'Add client'}
        subtitle={editing ? client!.name : 'Add someone you work with.'}
      />
      <ClientForm
        initial={client ?? undefined}
        submitLabel={editing ? 'Save changes' : 'Add client'}
        cancelTo={editing ? `/clients/${id}` : '/clients'}
        onSubmit={handleSubmit}
      />
    </>
  )
}
