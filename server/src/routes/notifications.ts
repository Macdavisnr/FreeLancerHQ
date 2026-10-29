import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

// GET /api/notifications  -> the latest 30, plus how many are unread (for the badge)
notificationsRouter.get('/', async (req, res) => {
  const [list, unread] = await Promise.all([
    pool.query(
      `SELECT id, kind, title, body, link, read_at AS "readAt", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.userId],
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.userId]),
  ])
  res.json({ notifications: list.rows, unreadCount: unread.rows[0].count })
})

// POST /api/notifications/read-all
notificationsRouter.post('/read-all', async (req, res) => {
  await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.userId])
  res.status(204).end()
})

// POST /api/notifications/:id/read
notificationsRouter.post('/:id/read', async (req, res) => {
  const { rowCount } = await pool.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2',
    [z.uuid('Invalid id.').parse(req.params.id), req.userId],
  )
  if (!rowCount) throw new HttpError(404, 'Notification not found.')
  res.status(204).end()
})
