import { api, ApiError } from '@/lib/api'
import type { Client, ClientInput } from '@/types/client'

export async function listClients(): Promise<Client[]> {
  const { clients } = await api<{ clients: Client[] }>('/clients')
  return clients
}

export async function getClient(id: string): Promise<Client | null> {
  try {
    const { client } = await api<{ client: Client }>(`/clients/${id}`)
    return client
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createClient(input: ClientInput): Promise<Client> {
  const { client } = await api<{ client: Client }>('/clients', { method: 'POST', body: input })
  return client
}

export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  const { client } = await api<{ client: Client }>(`/clients/${id}`, { method: 'PUT', body: input })
  return client
}

export async function setClientArchived(id: string, archived: boolean): Promise<Client> {
  const { client } = await api<{ client: Client }>(`/clients/${id}/archive`, {
    method: 'PATCH',
    body: { archived },
  })
  return client
}
