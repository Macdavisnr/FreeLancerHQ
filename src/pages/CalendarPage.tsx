import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import TextField from '@/components/TextField'
import { btnDanger, btnPrimary, btnSecondary } from '@/lib/ui'
import { createEvent, deleteEvent, getCalendar, updateEvent } from '@/services/calendarService'
import { listClients } from '@/services/clientService'
import type { CalendarEvent, CalendarItem, CalendarKind, EventInput } from '@/types/calendar'
import type { Client } from '@/types/client'
import { todayISO } from '@/utils/format'

/** Colour and wording per kind. Dots match the dashboard's "Upcoming" list. */
const KINDS: Record<CalendarKind, { label: string; dot: string; chip: string }> = {
  event: { label: 'Event', dot: 'bg-brand-600', chip: 'bg-brand-50 text-brand-700' },
  task: { label: 'Task due', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800' },
  project_start: { label: 'Project starts', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700' },
  project_deadline: { label: 'Project deadline', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-800' },
  invoice_due: { label: 'Invoice due', dot: 'bg-sun', chip: 'bg-amber-50 text-amber-900' },
}

// ---- Date helpers. Dates are 'YYYY-MM-DD' strings, built from LOCAL parts so the timezone can't
// shift a day (new Date('2026-10-30') would be midnight UTC, which is the 29th in the Americas).
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The 42 days (6 weeks, Monday first) shown for a month, including the spill-over days. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // getDay(): Sunday = 0. Shift so Monday = 0.
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i))
}

// 1 Jan 2024 was a Monday: format 7 days from it to get weekday names in the visitor's language.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }),
)

const EMPTY_FORM: EventInput = { title: '', date: '', time: null, clientId: null, projectId: null, notes: '' }

export default function CalendarPage() {
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selected, setSelected] = useState(today)
  const [items, setItems] = useState<CalendarItem[] | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [clients, setClients] = useState<Client[]>([])
  // null = form closed, 'new' = adding, otherwise the id of the event being edited
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<EventInput>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0) // bump to re-fetch after a change

  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const from = iso(days[0])
  const to = iso(days[days.length - 1])

  // Ask the server only for the 6 weeks on screen. If the month changes before the answer
  // arrives (fast clicking), the old answer is ignored so it can't overwrite the new month.
  useEffect(() => {
    let stale = false
    getCalendar(from, to)
      .then((data) => {
        if (stale) return
        setItems(data.items)
        setEvents(data.events)
      })
      .catch((err) => !stale && setError(err instanceof Error ? err.message : 'Could not load the calendar.'))
    return () => {
      stale = true
    }
  }, [from, to, version])

  useEffect(() => {
    listClients().then((all) => setClients(all.filter((c) => !c.archived)))
  }, [])

  // Group once per load: { '2026-10-30': [...items] }
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const item of items ?? []) map.set(item.date, [...(map.get(item.date) ?? []), item])
    return map
  }, [items])

  function moveMonth(delta: number) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function goToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
    setSelected(today)
  }

  function selectDay(date: Date) {
    setSelected(iso(date))
    // Clicking a spill-over day from the next/previous month moves the calendar there.
    if (date.getMonth() !== cursor.month) setCursor({ year: date.getFullYear(), month: date.getMonth() })
    if (editing === 'new') setForm((f) => ({ ...f, date: iso(date) }))
  }

  function openNew() {
    setError('')
    setForm({ ...EMPTY_FORM, date: selected })
    setEditing('new')
  }

  function openEdit(eventId: string) {
    const event = events.find((e) => e.id === eventId)
    if (!event) return
    setError('')
    setForm({ ...event })
    setEditing(event.id)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const saved = editing === 'new' ? await createEvent(form) : await updateEvent(editing!, form)
      setEditing(null)
      setSelected(saved.date)
      // Follow the event if it is in another month, and re-fetch.
      const d = parse(saved.date)
      setCursor({ year: d.getFullYear(), month: d.getMonth() })
      setVersion((v) => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the event.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!editing || editing === 'new' || !confirm('Delete this event?')) return
    setBusy(true)
    try {
      await deleteEvent(editing)
      setEditing(null)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the event.')
    } finally {
      setBusy(false)
    }
  }

  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const selectedItems = byDay.get(selected) ?? []
  const selectedTitle = parse(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Meetings, task due dates, project deadlines and invoice due dates in one place."
        action={<button onClick={openNew} className={btnPrimary}>New event</button>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- Month grid */}
        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold capitalize">{monthTitle}</h2>
            <div className="flex gap-2">
              <button onClick={() => moveMonth(-1)} aria-label="Previous month" className={`${btnSecondary} px-3 py-2`}>‹</button>
              <button onClick={goToday} className={`${btnSecondary} px-4 py-2`}>Today</button>
              <button onClick={() => moveMonth(1)} aria-label="Next month" className={`${btnSecondary} px-3 py-2`}>›</button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-2">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-xl border-t border-l border-line">
            {days.map((date) => {
              const key = iso(date)
              const dayItems = byDay.get(key) ?? []
              const inMonth = date.getMonth() === cursor.month
              const isSelected = key === selected
              return (
                <button
                  key={key}
                  onClick={() => selectDay(date)}
                  aria-label={`${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}${dayItems.length ? `, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={isSelected}
                  className={`flex min-h-14 flex-col items-stretch border-r border-b border-line p-1 text-left transition-colors sm:min-h-24 sm:p-1.5 ${
                    isSelected ? 'bg-brand-50' : inMonth ? 'bg-white hover:bg-canvas' : 'bg-canvas/60 hover:bg-canvas'
                  }`}
                >
                  <span
                    className={`mb-1 flex h-6 w-6 items-center justify-center self-center rounded-full text-sm sm:self-start ${
                      key === today ? 'bg-brand-600 font-bold text-white' : inMonth ? 'font-semibold' : 'text-muted/60'
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  {/* Phones: coloured dots. Larger screens: up to 2 labelled chips + "N more". */}
                  <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                    {dayItems.slice(0, 4).map((item) => (
                      <span key={item.kind + item.id} className={`h-1.5 w-1.5 rounded-full ${KINDS[item.kind].dot}`} />
                    ))}
                  </span>
                  <span className="hidden space-y-0.5 sm:block">
                    {dayItems.slice(0, 2).map((item) => (
                      <span
                        key={item.kind + item.id}
                        className={`block truncate rounded px-1.5 py-0.5 text-xs font-medium ${KINDS[item.kind].chip} ${item.done ? 'line-through opacity-60' : ''}`}
                      >
                        {item.time && <span className="font-semibold">{item.time} </span>}
                        {item.title}
                      </span>
                    ))}
                    {dayItems.length > 2 && (
                      <span className="block px-1.5 text-xs font-semibold text-muted">+{dayItems.length - 2} more</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
            {Object.values(KINDS).map((k) => (
              <li key={k.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${k.dot}`} />
                {k.label}
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- Selected day / event form */}
        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          {editing ? (
            <form onSubmit={handleSave}>
              <h2 className="mb-4 font-bold">{editing === 'new' ? 'New event' : 'Edit event'}</h2>
              <TextField
                label="Title"
                placeholder="Client meeting"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
                <TextField
                  label="Time (optional)"
                  id="event-time"
                  type="time"
                  value={form.time ?? ''}
                  onChange={(e) => setForm({ ...form, time: e.target.value || null })}
                />
              </div>
              <div className="mb-4">
                <label htmlFor="event-client" className="mb-1.5 block text-sm font-semibold">Client (optional)</label>
                <select
                  id="event-client"
                  value={form.clientId ?? ''}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value || null })}
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600"
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label htmlFor="event-notes" className="mb-1.5 block text-sm font-semibold">Notes (optional)</label>
                <textarea
                  id="event-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Agenda, meeting link…"
                  className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand-600"
                />
              </div>
              {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save event'}</button>
                <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
                {editing !== 'new' && (
                  <button type="button" onClick={handleDelete} disabled={busy} className={`${btnDanger} ml-auto`}>Delete</button>
                )}
              </div>
            </form>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-bold">{selected === today ? `Today, ${selectedTitle}` : selectedTitle}</h2>
                <button onClick={openNew} className="text-sm font-semibold text-brand-700">+ Add</button>
              </div>
              {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
              {items === null && <p className="text-muted">Loading…</p>}
              {items !== null && selectedItems.length === 0 && <p className="text-muted">Nothing on this day.</p>}
              <ul>
                {selectedItems.map((item) => {
                  const body = (
                    <>
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KINDS[item.kind].dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block font-semibold ${item.done ? 'text-muted line-through' : ''}`}>{item.title}</span>
                        <span className="block text-sm text-muted">
                          {KINDS[item.kind].label}
                          {item.subtitle && ` · ${item.subtitle}`}
                          {item.done && (item.kind === 'invoice_due' ? ' · Paid' : ' · Done')}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-muted">{item.time ?? 'All day'}</span>
                    </>
                  )
                  const row = 'flex w-full gap-3 border-t border-line py-3 text-left hover:bg-canvas/60'
                  return (
                    <li key={item.kind + item.id}>
                      {item.link ? (
                        <Link to={item.link} className={row}>{body}</Link>
                      ) : (
                        <button onClick={() => openEdit(item.id)} className={row}>{body}</button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  )
}
