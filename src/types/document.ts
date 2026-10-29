/** Mirrors the `documents` table, plus client/project names from JOINs. The file itself lives in storage. */
export interface Document {
  id: string
  name: string
  mimeType: string
  /** bytes */
  size: number
  createdAt: string
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
}
