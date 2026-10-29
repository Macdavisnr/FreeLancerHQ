import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { PAID_JOIN, STATUS_SQL, round2 } from '../sql.js'

export const reportsRouter = Router()
reportsRouter.use(requireAuth)

const MONTHS = `generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                               date_trunc('month', CURRENT_DATE), interval '1 month') m`

// GET /api/reports -> headline numbers plus the last 6 months of revenue vs expenses
reportsRouter.get('/', async (req, res) => {
  const userId = req.userId

  // Two separate queries (one per table), then merged by month below. Joining payments AND
  // expenses in a single query would multiply the rows and double-count the money.
  const [revenue, expenses, outstanding] = await Promise.all([
    pool.query(
      `SELECT to_char(m, 'YYYY-MM-DD') AS month, COALESCE(SUM(p.base_amount), 0)::float8 AS amount
       FROM ${MONTHS} LEFT JOIN payments p ON p.user_id = $1 AND date_trunc('month', p.paid_on) = m
       GROUP BY m ORDER BY m`,
      [userId],
    ),
    pool.query(
      `SELECT to_char(m, 'YYYY-MM-DD') AS month, COALESCE(SUM(e.amount), 0)::float8 AS amount
       FROM ${MONTHS} LEFT JOIN expenses e ON e.user_id = $1 AND date_trunc('month', e.spent_on) = m
       GROUP BY m ORDER BY m`,
      [userId],
    ),
    pool.query(
      `SELECT COALESCE(SUM((i.total - COALESCE(pay.paid, 0)) * i.base_rate), 0)::float8 AS amount, COUNT(*)::int AS count
       FROM invoices i ${PAID_JOIN} WHERE i.user_id = $1 AND (${STATUS_SQL}) IN ('sent', 'overdue')`,
      [userId],
    ),
  ])

  const months = revenue.rows.map((r, i) => ({
    month: r.month as string,
    revenue: r.amount as number,
    expenses: expenses.rows[i].amount as number,
    profit: round2(r.amount - expenses.rows[i].amount),
  }))
  const current = months[months.length - 1]
  const previous = months[months.length - 2]

  res.json({
    revenueThisMonth: current.revenue,
    revenueLastMonth: previous.revenue,
    expensesThisMonth: current.expenses,
    profitThisMonth: current.profit,
    outstanding: round2(outstanding.rows[0].amount),
    outstandingCount: outstanding.rows[0].count,
    months,
  })
})
