/** Where a calendar item comes from. Each maps to a different table on the server. */
export type CalendarKind = 'event' | 'task' | 'project_start' | 'project_deadline' | 'invoice_due'

/** One entry on the calendar, in the same shape whatever table it came from. */
export interface CalendarItem {
  kind: CalendarKind
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM', or null for all-day items */
  time: string | null
  title: string
  /** Project or client name, or '' */
  subtitle: string
  /** Where clicking it goes (null for events, which are edited on the calendar itself) */
  link: string | null
  /** Task finished / project completed / invoice paid */
  done: boolean
}

/** An event you created yourself (meeting, call, reminder). Mirrors the `events` table. */
export interface CalendarEvent {
  id: string
  title: string
  date: string
  time: string | null
  clientId: string | null
  projectId: string | null
  notes: string
}

export type EventInput = Omit<CalendarEvent, 'id'>
