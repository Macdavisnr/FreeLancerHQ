import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { PAID_JOIN, STATUS_SQL, toDate } from '../sql.js'

export const calendarRouter = Router()
export const eventsRouter = Router()

calendarRouter.use(requireAuth)
eventsRouter.use(requireAuth)

const dateString = z.iso.date('Enter a valid date.')
const id = (value: unknown) => z.uuid('Invalid id.').parse(value)
const optionalId = z.union([z.uuid(), z.literal('')]).nullish().transform((v) => v || null)

const eventSchema = z.object({
  title: z.string().trim().min(1, 'Give the event a title.').max(200),
  date: dateString,
  // 'HH:MM' from an <input type="time">, or empty for an all-day event.
  time: z
    .union([z.string().regex(/^\d{2}:\d{2}$/, 'Enter a valid time.'), z.literal('')])
    .nullish()
    .transform((v) => v || null),
  clientId: optionalId,
  projectId: optionalId,
  notes: z.string().trim().default(''),
})

const rangeSchema = z.object({ from: dateString, to: dateString })
const MAX_RANGE_DAYS = 62 // a month view shows at most 6 weeks; this stops "give me 10 years"

/*
 * GET /api/calendar?from=2026-10-26&to=2026-12-06
 *
 * Five different tables, one list. UNION ALL stacks the results of several SELECTs on top of
 * each other. For that to work every SELECT must return the SAME columns in the SAME order,
 * so each one maps its own table onto this common shape:
 *
 *   kind | id | date | time | title | subtitle | link | done
 *
 * The frontend then never needs to know which table an item came from, only its "kind".
 */
calendarRouter.get('/', async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query)
  if (to < from) throw new HttpError(400, '"to" cannot be before "from".')
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (days > MAX_RANGE_DAYS) throw new HttpError(400, `Ask for at most ${MAX_RANGE_DAYS} days at a time.`)

  const { rows } = await pool.query(
    `
    -- 1. Your own events (meetings, calls...)
    SELECT 'event' AS kind, e.id, ${toDate('e.date', 'date')}, to_char(e.start_time, 'HH24:MI') AS time,
           e.title, COALESCE(c.name, p.name, '') AS subtitle, NULL AS link, false AS done
    FROM events e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3

    UNION ALL
    -- 2. Tasks with a due date
    SELECT 'task', t.id, ${toDate('t.due_date', 'date')}, NULL, t.title, p.name,
           '/projects/' || p.id, t.done
    FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE t.user_id = $1 AND t.due_date BETWEEN $2 AND $3

    UNION ALL
    -- 3. Project start dates
    SELECT 'project_start', p.id, ${toDate('p.start_date', 'date')}, NULL, p.name, c.name,
           '/projects/' || p.id, false
    FROM projects p JOIN clients c ON c.id = p.client_id
    WHERE p.user_id = $1 AND p.start_date BETWEEN $2 AND $3

    UNION ALL
    -- 4. Project deadlines ("done" once the project is completed)
    SELECT 'project_deadline', p.id, ${toDate('p.deadline', 'date')}, NULL, p.name, c.name,
           '/projects/' || p.id, p.status = 'completed'
    FROM projects p JOIN clients c ON c.id = p.client_id
    WHERE p.user_id = $1 AND p.deadline BETWEEN $2 AND $3

    UNION ALL
    -- 5. Invoice due dates (drafts are left out: the client hasn't seen them yet)
    SELECT 'invoice_due', i.id, ${toDate('i.due_date', 'date')}, NULL,
           i.prefix || lpad(i.number::text, 3, '0'), c.name, '/invoices/' || i.id, (${STATUS_SQL}) = 'paid'
    FROM invoices i JOIN clients c ON c.id = i.client_id ${PAID_JOIN}
    WHERE i.user_id = $1 AND i.sent_at IS NOT NULL AND i.due_date BETWEEN $2 AND $3

    -- All-day items first (NULLS FIRST), then by time.
    ORDER BY date, time NULLS FIRST, kind, title`,
    [req.userId, from, to],
  )

  // Events are editable on the calendar page, so send their full details too.
  const { rows: events } = await pool.query(
    `SELECT id, title, ${toDate('date', 'date')}, to_char(start_time, 'HH24:MI') AS time,
            client_id AS "clientId", project_id AS "projectId", notes
     FROM events WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
    [req.userId, from, to],
  )
  res.json({ items: rows, events })
})

/** An event may only point at the user's own client / project. */
async function assertOwnLinks(input: z.infer<typeof eventSchema>, userId: string) {
  if (input.clientId) {
    const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND user_id = $2', [input.clientId, userId])
    if (!rowCount) throw new HttpError(400, 'Choose one of your clients.')
  }
  if (input.projectId) {
    const { rowCount } = await pool.query('SELECT 1 FROM projects WHERE id = $1 AND user_id = $2', [input.projectId, userId])
    if (!rowCount) throw new HttpError(400, 'Choose one of your projects.')
  }
}

const EVENT_COLUMNS = `id, title, ${toDate('date', 'date')}, to_char(start_time, 'HH24:MI') AS time,
  client_id AS "clientId", project_id AS "projectId", notes`

// POST /api/events
eventsRouter.post('/', async (req, res) => {
  const e = eventSchema.parse(req.body)
  await assertOwnLinks(e, req.userId)
  const { rows } = await pool.query(
    `INSERT INTO events (user_id, title, date, start_time, client_id, project_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${EVENT_COLUMNS}`,
    [req.userId, e.title, e.date, e.time, e.clientId, e.projectId, e.notes],
  )
  res.status(201).json({ event: rows[0] })
})

// PUT /api/events/:id
eventsRouter.put('/:id', async (req, res) => {
  const e = eventSchema.parse(req.body)
  await assertOwnLinks(e, req.userId)
  const { rows } = await pool.query(
    `UPDATE events SET title = $3, date = $4, start_time = $5, client_id = $6, project_id = $7, notes = $8,
            updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${EVENT_COLUMNS}`,
    [id(req.params.id), req.userId, e.title, e.date, e.time, e.clientId, e.projectId, e.notes],
  )
  if (!rows[0]) throw new HttpError(404, 'Event not found.')
  res.json({ event: rows[0] })
})

// DELETE /api/events/:id
eventsRouter.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1 AND user_id = $2', [id(req.params.id), req.userId])
  if (!rowCount) throw new HttpError(404, 'Event not found.')
  res.status(204).end()
})
