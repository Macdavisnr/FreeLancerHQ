import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { round2, toDate } from '../sql.js'

export const expensesRouter = Router()
expensesRouter.use(requireAuth)

const COLUMNS = `id, description, category, amount::float8 AS amount, ${toDate('spent_on', 'spentOn')}`

const expenseSchema = z.object({
  description: z.string().trim().min(1, 'Description is required.'),
  category: z.string().trim().min(1).default('Other'),
  amount: z.coerce.number('Amount must be a number.').positive('Amount must be more than 0.'),
  spentOn: z.iso.date('Enter a valid date.'),
})

const id = (value: unknown) => z.uuid('Invalid id.').parse(value)

// GET /api/expenses -> all expenses + this month's headline numbers
expensesRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM expenses WHERE user_id = $1 ORDER BY spent_on DESC, created_at DESC`, [req.userId])

  const thisMonth = await pool.query(
    `SELECT category, SUM(amount)::float8 AS total, COUNT(*)::int AS count
     FROM expenses
     WHERE user_id = $1 AND date_trunc('month', spent_on) = date_trunc('month', CURRENT_DATE)
     GROUP BY category ORDER BY total DESC`,
    [req.userId],
  )
  const monthTotal = round2(thisMonth.rows.reduce((s, r) => s + r.total, 0))
  const monthCount = thisMonth.rows.reduce((s, r) => s + r.count, 0)
  const top = thisMonth.rows[0]

  res.json({
    expenses: rows,
    summary: {
      monthTotal,
      monthCount,
      largestCategory: top ? { name: top.category, amount: top.total } : null,
    },
  })
})

// GET /api/expenses/:id
expensesRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM expenses WHERE id = $1 AND user_id = $2`, [id(req.params.id), req.userId])
  if (!rows[0]) throw new HttpError(404, 'Expense not found.')
  res.json({ expense: rows[0] })
})

// POST /api/expenses
expensesRouter.post('/', async (req, res) => {
  const e = expenseSchema.parse(req.body)
  const { rows } = await pool.query(
    `INSERT INTO expenses (user_id, description, category, amount, spent_on) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [req.userId, e.description, e.category, round2(e.amount), e.spentOn],
  )
  res.status(201).json({ expense: rows[0] })
})

// PUT /api/expenses/:id
expensesRouter.put('/:id', async (req, res) => {
  const e = expenseSchema.parse(req.body)
  const { rows } = await pool.query(
    `UPDATE expenses SET description = $3, category = $4, amount = $5, spent_on = $6, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    [id(req.params.id), req.userId, e.description, e.category, round2(e.amount), e.spentOn],
  )
  if (!rows[0]) throw new HttpError(404, 'Expense not found.')
  res.json({ expense: rows[0] })
})

// DELETE /api/expenses/:id
expensesRouter.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id(req.params.id), req.userId])
  if (!rowCount) throw new HttpError(404, 'Expense not found.')
  res.status(204).end()
})
