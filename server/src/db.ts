import 'dotenv/config'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.')
}

// A pool keeps a few database connections open and reuses them across requests.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
