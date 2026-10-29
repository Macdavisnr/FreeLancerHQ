import { runScheduledJobs } from './notifications.js'

/*
 * THE SCHEDULER: code that runs on a timer instead of in answer to a request.
 *
 * While this server process is running (development, or a host that keeps servers on, like
 * Render/Railway), a setInterval runs the jobs every hour. On serverless hosts such as Vercel
 * the process isn't always running, so there the jobs are triggered by a cron service calling
 * GET /api/cron/run instead (see routes/cron.ts). Either way the jobs are the same, and they
 * are deduplicated, so running them too often is harmless.
 */
const EVERY_HOUR = 60 * 60 * 1000
let running = false

async function tick() {
  if (running) return // a slow run is still going: don't start a second one alongside it
  running = true
  try {
    const result = await runScheduledJobs()
    if (result.overdue || result.weekly) console.log(`Scheduled jobs: ${result.overdue} overdue reminder(s), ${result.weekly} weekly summary(ies)`)
  } catch (err) {
    console.error('Scheduled jobs failed:', err)
  } finally {
    running = false
  }
}

export function startScheduler() {
  if (process.env.SCHEDULER === 'off') return
  setTimeout(tick, 10_000) // shortly after start-up, so a missed run catches up quickly
  setInterval(tick, EVERY_HOUR).unref() // unref: the timer alone doesn't keep the process alive
}
