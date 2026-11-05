import 'dotenv/config'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.')
}

// A pool keeps a few database connections open and reuses them across requests.
// On Vercel each running copy of the API has its own pool, so idle connections are closed
// quickly to avoid holding many open at the database (use Neon's "pooled" connection string).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.VERCEL && { max: 5, idleTimeoutMillis: 5_000 }),
})
