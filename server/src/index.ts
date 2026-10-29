import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { errorHandler } from './errors.js'
import { authRouter } from './routes/auth.js'
import { calendarRouter, eventsRouter } from './routes/calendar.js'
import { clientsRouter } from './routes/clients.js'
import { profileRouter, settingsRouter } from './routes/account.js'
import { dashboardRouter } from './routes/dashboard.js'
import { documentsRouter } from './routes/documents.js'
import { expensesRouter } from './routes/expenses.js'
import { invoicesRouter, paymentsRouter } from './routes/invoices.js'
import { projectsRouter, tasksRouter } from './routes/projects.js'
import { paystackSettingsRouter, paystackWebhook } from './routes/paystack.js'
import { proposalsRouter } from './routes/proposals.js'
import { publicRouter } from './routes/public.js'
import { ratesRouter } from './routes/rates.js'
import { reportsRouter } from './routes/reports.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5180' }))
// Webhooks need the raw, unparsed body to check their signature, so this one route is
// registered BEFORE express.json() turns bodies into objects. See routes/paystack.ts.
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json', limit: '1mb' }), paystackWebhook)

app.use(express.json())

// Simplest possible endpoint: lets us check the server is alive.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/invoices', invoicesRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/expenses', expensesRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/events', eventsRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/public', publicRouter) // no login: see routes/public.ts
app.use('/api/rates', ratesRouter)
app.use('/api/proposals', proposalsRouter)
app.use('/api/settings/paystack', paystackSettingsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/profile', profileRouter)

// Must come last: catches anything thrown by the routes above.
app.use(errorHandler)

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
