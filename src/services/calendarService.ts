import { api } from '@/lib/api'
import type { CalendarEvent, CalendarItem, EventInput } from '@/types/calendar'

/** Everything on the calendar between two dates (inclusive, 'YYYY-MM-DD'). */
export function getCalendar(from: string, to: string) {
  return api<{ items: CalendarItem[]; events: CalendarEvent[] }>(`/calendar?from=${from}&to=${to}`)
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  const { event } = await api<{ event: CalendarEvent }>('/events', { method: 'POST', body: input })
  return event
}

export async function updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
  const { event } = await api<{ event: CalendarEvent }>(`/events/${id}`, { method: 'PUT', body: input })
  return event
}

export async function deleteEvent(id: string): Promise<void> {
  await api<void>(`/events/${id}`, { method: 'DELETE' })
}
