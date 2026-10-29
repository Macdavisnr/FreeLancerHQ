/** Mirrors the future `clients` database table (camelCase here, snake_case in SQL). */
export interface Client {
  id: string
  userId: string
  name: string
  email: string
  phone: string
  company: string
  address: string
  notes: string
  /** "Archive" instead of delete: the row stays, so past projects/invoices keep their client. */
  archived: boolean
  /** Projects that are not completed yet (computed by the API). */
  activeProjects: number
  /** Total of sent invoices, and how much of it is still unpaid (computed by the API). */
  totalBilled: number
  outstanding: number
  invoiceCount: number
  createdAt: string
  updatedAt: string
}

/** What the form collects. The server (for now: the service) fills in the rest. */
export type ClientInput = Pick<
  Client,
  'name' | 'email' | 'phone' | 'company' | 'address' | 'notes'
>
