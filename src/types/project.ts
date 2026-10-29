export type ProjectStatus = 'not_started' | 'in_progress' | 'review' | 'completed'

/** Mirrors the `projects` table, plus clientName from a JOIN with `clients`. */
export interface Project {
  id: string
  clientId: string
  clientName: string
  name: string
  description: string
  status: ProjectStatus
  budget: number
  /** 'YYYY-MM-DD' or null */
  startDate: string | null
  deadline: string | null
  /** Total of sent invoices for this project (computed by the API). */
  invoiced: number
  invoiceCount: number
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  done: boolean
  /** 'YYYY-MM-DD' or null */
  dueDate: string | null
  createdAt: string
}

export type ProjectInput = Pick<
  Project,
  'clientId' | 'name' | 'description' | 'status' | 'budget' | 'startDate' | 'deadline'
>

/** A task as listed on the Tasks page: plus its project and client, from JOINs. */
export interface TaskWithProject extends Task {
  projectName: string
  projectStatus: ProjectStatus
  /** 'YYYY-MM-DD' or null */
  projectDeadline: string | null
  clientName: string
}
