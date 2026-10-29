import { api, ApiError } from '@/lib/api'
import type {
  GenerateProposalInput,
  Proposal,
  ProposalContent,
  ProposalInput,
  ProposalStatus,
} from '@/types/proposal'

export async function listProposals(): Promise<Proposal[]> {
  const { proposals } = await api<{ proposals: Proposal[] }>('/proposals')
  return proposals
}

export async function getProposal(id: string): Promise<Proposal | null> {
  try {
    const { proposal } = await api<{ proposal: Proposal }>(`/proposals/${id}`)
    return proposal
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createProposal(input: ProposalInput): Promise<Proposal> {
  const { proposal } = await api<{ proposal: Proposal }>('/proposals', { method: 'POST', body: input })
  return proposal
}

export async function updateProposal(id: string, input: ProposalInput): Promise<Proposal> {
  const { proposal } = await api<{ proposal: Proposal }>(`/proposals/${id}`, { method: 'PUT', body: input })
  return proposal
}

export async function setProposalStatus(id: string, status: ProposalStatus): Promise<Proposal> {
  const { proposal } = await api<{ proposal: Proposal }>(`/proposals/${id}/status`, { method: 'PATCH', body: { status } })
  return proposal
}

export const deleteProposal = (id: string) => api<void>(`/proposals/${id}`, { method: 'DELETE' })

/** Turn an accepted proposal into a project (its deliverables become tasks). */
export const convertProposal = (id: string) =>
  api<{ proposal: Proposal; projectId: string }>(`/proposals/${id}/convert`, { method: 'POST' })

/** Ask the AI to write a draft. Nothing is saved; the person reviews it first. */
export async function generateProposal(input: GenerateProposalInput): Promise<ProposalContent> {
  const { proposal } = await api<{ proposal: ProposalContent }>('/proposals/generate', { method: 'POST', body: input })
  return proposal
}
