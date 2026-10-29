import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { currencyCode } from '../currencies.js'
import { getRate, RATES_ATTRIBUTION } from '../rates.js'

export const ratesRouter = Router()
ratesRouter.use(requireAuth)

// GET /api/rates?from=USD&to=NGN -> how much 1 USD is worth in NGN right now
ratesRouter.get('/', async (req, res) => {
  const { from, to } = z.object({ from: currencyCode, to: currencyCode }).parse(req.query)
  const { rate, fetchedAt, stale } = await getRate(from, to)
  res.json({ from, to, rate, fetchedAt, stale, attribution: RATES_ATTRIBUTION })
})
