import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'

export const projectsRouter = Router()
export const tasksRouter = Router()

projectsRouter.use(requireAuth)
tasksRouter.use(requireAuth)

/*
 * Two Postgres quirks we smooth over in SQL:
 *  - NUMERIC comes back as a string, so we cast budget to a float.
 *  - DATE would become a JS Date (with timezone surprises), so we format it as 'YYYY-MM-DD'.
 * JOIN clients lets one query return the client's name next to each project.
 */
const PROJECT_SELECT = `
  SELECT p.id, p.client_id AS "clientId", c.name AS "clientName", p.name, p.description,
         p.status, p.budget::float8 AS budget,
         to_char(p.start_date, 'YYYY-MM-DD') AS "startDate",
         to_char(p.deadline, 'YYYY-MM-DD') AS "deadline",
         p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         (SELECT COALESCE(SUM(i.total * i.base_rate), 0)::float8 FROM invoices i
           WHERE i.project_id = p.id AND i.sent_at IS NOT NULL) AS invoiced,
         (SELECT COUNT(*)::int FROM invoices i
           WHERE i.project_id = p.id AND i.sent_at IS NOT NULL) AS "invoiceCount"
  FROM projects p
  JOIN clients c ON c.id = p.client_id`

const TASK_COLUMNS = `id, project_id AS "projectId", title, done,
  to_char(due_date, 'YYYY-MM-DD') AS "dueDate", created_at AS "createdAt"`

const dateField = z
  .union([z.iso.date(), z.literal('')])
  .nullish()
  .transform((v) => v || null)

const projectSchema = z.object({
  clientId: z.uuid('Choose a client.'),
  name: z.string().trim().min(1, 'Project name is required.'),
  description: z.string().trim().default(''),
  status: z.enum(['not_started', 'in_progress', 'review', 'completed'], 'Choose a valid status.').default('not_started'),
  budget: z.coerce.number('Budget must be a number.').min(0, 'Budget cannot be negative.').default(0),
  startDate: dateField,
  deadline: dateField,
})

const id = (value: unknown) => z.uuid('Invalid id.').parse(value)

/** A project may only point at one of the user's own clients. */
async function assertOwnClient(clientId: string, userId: string) {
  const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND user_id = $2', [
    clientId,
    userId,
  ])
  if (!rowCount) throw new HttpError(400, 'Choose one of your clients.')
}

async function loadProject(projectId: string, userId: string) {
  const { rows } = await pool.query(`${PROJECT_SELECT} WHERE p.id = $1 AND p.user_id = $2`, [
    projectId,
    userId,
  ])
  if (!rows[0]) throw new HttpError(404, 'Project not found.')
  return rows[0]
}

// GET /api/projects            -> all projects
// GET /api/projects?clientId=x -> only that client's projects
projectsRouter.get('/', async (req, res) => {
  const params: unknown[] = [req.userId]
  let where = 'WHERE p.user_id = $1'
  if (typeof req.query.clientId === 'string') {
    params.push(id(req.query.clientId))
    where += ` AND p.client_id = $${params.length}`
  }
  const { rows } = await pool.query(`${PROJECT_SELECT} ${where} ORDER BY p.deadline NULLS LAST, p.name`, params)
  res.json({ projects: rows })
})

// GET /api/projects/:id  -> the project plus its tasks
projectsRouter.get('/:id', async (req, res) => {
  const projectId = id(req.params.id)
  const project = await loadProject(projectId, req.userId)
  const { rows: tasks } = await pool.query(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE project_id = $1 AND user_id = $2 ORDER BY created_at`,
    [projectId, req.userId],
  )
  res.json({ project, tasks })
})

// POST /api/projects
projectsRouter.post('/', async (req, res) => {
  const p = projectSchema.parse(req.body)
  await assertOwnClient(p.clientId, req.userId)
  const { rows } = await pool.query(
    `INSERT INTO projects (user_id, client_id, name, description, status, budget, start_date, deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [req.userId, p.clientId, p.name, p.description, p.status, p.budget, p.startDate, p.deadline],
  )
  res.status(201).json({ project: await loadProject(rows[0].id, req.userId) })
})

// PUT /api/projects/:id
projectsRouter.put('/:id', async (req, res) => {
  const projectId = id(req.params.id)
  const p = projectSchema.parse(req.body)
  await assertOwnClient(p.clientId, req.userId)
  const { rowCount } = await pool.query(
    `UPDATE projects
     SET client_id = $3, name = $4, description = $5, status = $6, budget = $7,
         start_date = $8, deadline = $9, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [projectId, req.userId, p.clientId, p.name, p.description, p.status, p.budget, p.startDate, p.deadline],
  )
  if (!rowCount) throw new HttpError(404, 'Project not found.')
  res.json({ project: await loadProject(projectId, req.userId) })
})

// POST /api/projects/:id/tasks
projectsRouter.post('/:id/tasks', async (req, res) => {
  const projectId = id(req.params.id)
  const { title, dueDate } = z
    .object({ title: z.string().trim().min(1, 'Task title is required.'), dueDate: dateField })
    .parse(req.body)
  await loadProject(projectId, req.userId) // 404 unless it's the user's project
  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, project_id, title, due_date) VALUES ($1, $2, $3, $4) RETURNING ${TASK_COLUMNS}`,
    [req.userId, projectId, title, dueDate],
  )
  res.status(201).json({ task: rows[0] })
})

// GET /api/tasks             -> every task across all projects
// GET /api/tasks?done=false  -> only open tasks (done=true: only finished ones)
// Two JOINs walk up the relationships: task -> its project -> that project's client.
tasksRouter.get('/', async (req, res) => {
  const params: unknown[] = [req.userId]
  let where = 'WHERE t.user_id = $1'
  if (req.query.done === 'true' || req.query.done === 'false') {
    params.push(req.query.done === 'true')
    where += ` AND t.done = $${params.length}`
  }
  const { rows } = await pool.query(
    `SELECT t.id, t.project_id AS "projectId", t.title, t.done,
            to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate", t.created_at AS "createdAt",
            p.name AS "projectName", p.status AS "projectStatus",
            to_char(p.deadline, 'YYYY-MM-DD') AS "projectDeadline",
            c.name AS "clientName"
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN clients c ON c.id = p.client_id
     ${where}
     ORDER BY p.deadline NULLS LAST, p.name, t.created_at`,
    params,
  )
  res.json({ tasks: rows })
})

// PATCH /api/tasks/:id  body: { done?: boolean, title?: string, dueDate?: 'YYYY-MM-DD' | null }
tasksRouter.patch('/:id', async (req, res) => {
  const taskId = id(req.params.id)
  const changes = z
    .object({ done: z.boolean().optional(), title: z.string().trim().min(1).optional(), dueDate: dateField })
    .parse(req.body)
  // COALESCE keeps the current value when a field wasn't sent.
  // dueDate can't use that trick: null is a real value for it ("remove the due date"). So we pass a
  // separate flag ($5) saying whether dueDate was in the request at all.
  const { rows } = await pool.query(
    `UPDATE tasks SET done = COALESCE($3, done), title = COALESCE($4, title),
            due_date = CASE WHEN $5 THEN $6::date ELSE due_date END, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${TASK_COLUMNS}`,
    [taskId, req.userId, changes.done ?? null, changes.title ?? null, 'dueDate' in req.body, changes.dueDate],
  )
  if (!rows[0]) throw new HttpError(404, 'Task not found.')
  res.json({ task: rows[0] })
})

// DELETE /api/tasks/:id
tasksRouter.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [
    id(req.params.id),
    req.userId,
  ])
  if (!rowCount) throw new HttpError(404, 'Task not found.')
  res.status(204).end()
})
