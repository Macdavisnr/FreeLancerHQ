export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined'

export interface TimelinePhase {
  phase: string
  duration: string
  description: string
}

export interface PriceLine {
  item: string
  amount: number
}

/** The written parts of a proposal: what the AI produces and what the person edits. */
export interface ProposalContent {
  title: string
  summary: string
  scope: string
  deliverables: string[]
  timeline: TimelinePhase[]
  pricing: PriceLine[]
  questions: string[]
  terms: string
}

/** Mirrors the `proposals` table (plus names from joins with clients and projects). */
export interface Proposal extends ProposalContent {
  id: string
  clientId: string
  clientName: string
  projectId: string | null
  projectName: string | null
  status: ProposalStatus
  /** The currency the proposal is quoted in; may differ from the account's home currency. */
  currency: string
  budget: number
  /** The client's job description this proposal answers */
  brief: string
  aiGenerated: boolean
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProposalInput extends ProposalContent {
  clientId: string
  currency: string
  budget: number
  brief: string
  aiGenerated: boolean
}

export interface GenerateProposalInput {
  clientId: string | null
  jobTitle: string
  description: string
  requirements: string
  budget: number | null
  currency: string
  timelineHint: string
  tone: 'professional' | 'friendly' | 'concise'
}
