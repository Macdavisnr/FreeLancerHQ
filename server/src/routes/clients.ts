import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { PAID_JOIN } from '../sql.js'

export const clientsRouter = Router()

// Every route in this file requires a logged-in user.
clientsRouter.use(requireAuth)

// Database columns are snake_case; the frontend uses camelCase. "AS" renames them.
// totalBilled / outstanding are in the account's home currency (invoice amount x its saved rate).
// activeProjects is computed on the fly with a subquery: projects that aren't completed yet.
const COLUMNS = `id, user_id AS "userId", name, email, phone, company, address, notes,
  archived, created_at AS "createdAt", updated_at AS "updatedAt",
  (SELECT count(*)::int FROM projects p
    WHERE p.client_id = clients.id AND p.status <> 'completed') AS "activeProjects",
  (SELECT COALESCE(SUM(i.total * i.base_rate), 0)::float8 FROM invoices i
    WHERE i.client_id = clients.id AND i.sent_at IS NOT NULL) AS "totalBilled",
  (SELECT COALESCE(SUM((i.total - COALESCE(pay.paid, 0)) * i.base_rate), 0)::float8 FROM invoices i ${PAID_JOIN}
    WHERE i.client_id = clients.id AND i.sent_at IS NOT NULL) AS outstanding,
  (SELECT COUNT(*)::int FROM invoices i
    WHERE i.client_id = clients.id AND i.sent_at IS NOT NULL) AS "invoiceCount"`

const clientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required.'),
  email: z.string().trim().pipe(z.email('Enter a valid email address.')),
  phone: z.string().trim().default(''),
  company: z.string().trim().default(''),
  address: z.string().trim().default(''),
  notes: z.string().trim().default(''),
})

const idSchema = z.uuid('Invalid client id.')

// Notice every query has "AND user_id = $n": a user can only ever touch their own clients.

// GET /api/clients
clientsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM clients WHERE user_id = $1 ORDER BY name`,
    [req.userId],
  )
  res.json({ clients: rows })
})

// GET /api/clients/:id
clientsRouter.get('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id)
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM clients WHERE id = $1 AND user_id = $2`,
    [id, req.userId],
  )
  if (!rows[0]) throw new HttpError(404, 'Client not found.')
  res.json({ client: rows[0] })
})

// POST /api/clients
clientsRouter.post('/', async (req, res) => {
  const c = clientSchema.parse(req.body)
  const { rows } = await pool.query(
    `INSERT INTO clients (user_id, name, email, phone, company, address, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [req.userId, c.name, c.email, c.phone, c.company, c.address, c.notes],
  )
  res.status(201).json({ client: rows[0] })
})

// PUT /api/clients/:id
clientsRouter.put('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id)
  const c = clientSchema.parse(req.body)
  const { rows } = await pool.query(
    `UPDATE clients
     SET name = $3, email = $4, phone = $5, company = $6, address = $7, notes = $8, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, req.userId, c.name, c.email, c.phone, c.company, c.address, c.notes],
  )
  if (!rows[0]) throw new HttpError(404, 'Client not found.')
  res.json({ client: rows[0] })
})

// PATCH /api/clients/:id/archive   body: { "archived": true | false }
clientsRouter.patch('/:id/archive', async (req, res) => {
  const id = idSchema.parse(req.params.id)
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body)
  const { rows } = await pool.query(
    `UPDATE clients SET archived = $3, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [id, req.userId, archived],
  )
  if (!rows[0]) throw new HttpError(404, 'Client not found.')
  res.json({ client: rows[0] })
})
