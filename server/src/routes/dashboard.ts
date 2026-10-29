import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { PAID_JOIN, STATUS_SQL, round2, toDate } from '../sql.js'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

// GET /api/dashboard -> every number the dashboard needs, in one request
dashboardRouter.get('/', async (req, res) => {
  const userId = req.userId

  const [revenue, outstanding, projects, expenses, months, upcoming] = await Promise.all([
    // Revenue = money actually received (payments), in the home currency, this month and last month.
    pool.query(
      `SELECT
         COALESCE(SUM(base_amount) FILTER (WHERE date_trunc('month', paid_on) = date_trunc('month', CURRENT_DATE)), 0)::float8 AS "thisMonth",
         COALESCE(SUM(base_amount) FILTER (WHERE date_trunc('month', paid_on) = date_trunc('month', CURRENT_DATE) - interval '1 month'), 0)::float8 AS "lastMonth"
       FROM payments WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT COALESCE(SUM((i.total - COALESCE(pay.paid, 0)) * i.base_rate), 0)::float8 AS amount, COUNT(*)::int AS count
       FROM invoices i ${PAID_JOIN}
       WHERE i.user_id = $1 AND (${STATUS_SQL}) IN ('sent', 'overdue')`,
      [userId],
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status <> 'completed')::int AS active,
              COUNT(*) FILTER (WHERE status <> 'completed' AND deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS "dueThisWeek"
       FROM projects WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM expenses
       WHERE user_id = $1 AND date_trunc('month', spent_on) = date_trunc('month', CURRENT_DATE)`,
      [userId],
    ),
    pool.query(
      `SELECT to_char(m, 'YYYY-MM-DD') AS month, COALESCE(SUM(p.base_amount), 0)::float8 AS amount
       FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months', date_trunc('month', CURRENT_DATE), interval '1 month') m
       LEFT JOIN payments p ON p.user_id = $1 AND date_trunc('month', p.paid_on) = m
       GROUP BY m ORDER BY m`,
      [userId],
    ),
    // Next 14 days: your events, open tasks, project deadlines and unpaid invoice due dates, soonest first.
    pool.query(
      `(SELECT 'event' AS kind, title AS label, ${toDate('date', 'date')}, to_char(start_time, 'HH24:MI') AS time
        FROM events WHERE user_id = $1 AND date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14)
       UNION ALL
       (SELECT 'task', title, ${toDate('due_date', 'date')}, NULL
        FROM tasks WHERE user_id = $1 AND NOT done AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14)
       UNION ALL
       (SELECT 'project', name, ${toDate('deadline', 'date')}, NULL
        FROM projects WHERE user_id = $1 AND status <> 'completed' AND deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 14)
       UNION ALL
       (SELECT 'invoice', 'Invoice ' || i.prefix || lpad(i.number::text, 3, '0') || ' due', ${toDate('i.due_date', 'date')}, NULL
        FROM invoices i ${PAID_JOIN}
        WHERE i.user_id = $1 AND (${STATUS_SQL}) IN ('sent', 'overdue') AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14)
       ORDER BY date, time NULLS FIRST LIMIT 8`,
      [userId],
    ),
  ])

  res.json({
    revenueThisMonth: revenue.rows[0].thisMonth,
    revenueLastMonth: revenue.rows[0].lastMonth,
    outstanding: round2(outstanding.rows[0].amount),
    outstandingCount: outstanding.rows[0].count,
    activeProjects: projects.rows[0].active,
    projectsDueThisWeek: projects.rows[0].dueThisWeek,
    expensesThisMonth: expenses.rows[0].total,
    revenueByMonth: months.rows,
    upcoming: upcoming.rows,
  })
})
