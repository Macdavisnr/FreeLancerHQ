import { pool } from './db.js'
import { HttpError } from './errors.js'

/*
 * Exchange rates.
 *
 * Source: ExchangeRate-API's free "open" endpoint (no key, 160+ currencies incl. NGN, updated
 * once a day). Rates are "per 1 USD", so any pair is a division: 1 EUR in NGN = NGN / EUR.
 * Their terms ask for attribution, which the app shows next to converted amounts.
 *
 * To avoid calling them on every request, the latest rates are cached in the database and in
 * memory for 12 hours. If the source is down we keep using the last known rates (flagged
 * `stale`) instead of blocking people from working.
 */

const SOURCE_URL = process.env.EXCHANGE_RATE_API_URL ?? 'https://open.er-api.com/v6/latest/USD'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export const RATES_ATTRIBUTION = 'https://www.exchangerate-api.com'

interface Snapshot {
  rates: Record<string, number>
  fetchedAt: Date
}

let memo: Snapshot | null = null

const isFresh = (s: Snapshot) => Date.now() - s.fetchedAt.getTime() < MAX_AGE_MS

async function fetchFromSource(): Promise<Snapshot> {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Rates source responded ${response.status}`)
  const body = (await response.json()) as { result?: string; rates?: Record<string, number> }
  if (body.result !== 'success' || !body.rates) throw new Error('Rates source returned an unexpected response')
  const snapshot = { rates: { ...body.rates, USD: 1 }, fetchedAt: new Date() }
  await pool.query(
    `INSERT INTO exchange_rates (id, rates, source, fetched_at) VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET rates = EXCLUDED.rates, source = EXCLUDED.source, fetched_at = now()`,
    [JSON.stringify(snapshot.rates), SOURCE_URL],
  )
  return snapshot
}

export async function getRates(): Promise<Snapshot & { stale: boolean }> {
  if (memo && isFresh(memo)) return { ...memo, stale: false }

  const saved = await pool.query('SELECT rates, fetched_at FROM exchange_rates WHERE id = 1')
  if (saved.rows[0]) memo = { rates: saved.rows[0].rates, fetchedAt: saved.rows[0].fetched_at }
  if (memo && isFresh(memo)) return { ...memo, stale: false }

  try {
    memo = await fetchFromSource()
    return { ...memo, stale: false }
  } catch (err) {
    console.error('Could not refresh exchange rates:', err)
    if (memo) return { ...memo, stale: true } // better an old rate than none
    throw new HttpError(503, 'Exchange rates are unavailable right now. Please try again shortly.')
  }
}

export interface Rate {
  /** 1 unit of `from` = `rate` units of `to` */
  rate: number
  fetchedAt: Date
  stale: boolean
}

export async function getRate(from: string, to: string): Promise<Rate> {
  if (from === to) return { rate: 1, fetchedAt: new Date(), stale: false }
  const { rates, fetchedAt, stale } = await getRates()
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate || !toRate) {
    throw new HttpError(400, `No exchange rate is available for ${from} to ${to}.`)
  }
  return { rate: toRate / fromRate, fetchedAt, stale }
}
