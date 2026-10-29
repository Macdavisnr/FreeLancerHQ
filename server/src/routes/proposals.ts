import { Router } from 'express'
import { z } from 'zod'
import { generateProposal, normalizePricing } from '../ai.js'
import { requireAuth } from '../auth.js'
import { currencyCode } from '../currencies.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { checkRateLimit } from '../rateLimit.js'
import { getRate } from '../rates.js'
import { getSettings } from '../settings.js'
import { round2 } from '../sql.js'

export const proposalsRouter = Router()
proposalsRouter.use(requireAuth)

const PROPOSAL_SELECT = `
  SELECT p.id, p.client_id AS "clientId", c.name AS "clientName", p.project_id AS "projectId", pr.name AS "projectName",
         p.title, p.status, p.currency, p.budget::float8 AS budget, p.brief, p.summary, p.scope,
         p.deliverables, p.timeline, p.pricing, p.questions, p.terms, p.ai_generated AS "aiGenerated",
         p.sent_at AS "sentAt", p.responded_at AS "respondedAt", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
  FROM proposals p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN projects pr ON pr.id = p.project_id`

const textList = z.array(z.string().trim().min(1).max(500)).max(50)

const proposalSchema = z.object({
  clientId: z.uuid('Choose a client.'),
  currency: currencyCode.optional(),
  budget: z.coerce.number('Budget must be a number.').min(0, 'Budget cannot be negative.').default(0),
  brief: z.string().trim().max(8000).default(''),
  aiGenerated: z.boolean().default(false),
  title: z.string().trim().min(1, 'Give the proposal a title.').max(200),
  summary: z.string().trim().max(5000).default(''),
  scope: z.string().trim().max(10000).default(''),
  deliverables: textList.default([]),
  timeline: z
    .array(
      z.object({
        phase: z.string().trim().min(1, 'Every timeline phase needs a name.').max(200),
        duration: z.string().trim().max(100).default(''),
        description: z.string().trim().max(1000).default(''),
      }),
    )
    .max(30)
    .default([]),
  pricing: z
    .array(
      z.object({
        item: z.string().trim().min(1, 'Every price line needs a description.').max(200),
        amount: z.coerce.number('Price amounts must be numbers.').min(0, 'Price amounts cannot be negative.'),
      }),
    )
    .max(30)
    .default([]),
  questions: textList.default([]),
  terms: z.string().trim().max(5000).default(''),
})

type ProposalInput = z.infer<typeof proposalSchema>

const generateSchema = z.object({
  clientId: z.union([z.uuid(), z.literal('')]).nullish().transform((v) => v || null),
  jobTitle: z.string().trim().min(1, 'Enter the job title.').max(200),
  description: z
    .string()
    .trim()
    .min(20, 'Describe the job in a little more detail (at least 20 characters).')
    .max(8000, 'The job description is too long (max 8000 characters).'),
  requirements: z.string().trim().max(4000).default(''),
  budget: z.coerce.number().min(0).nullish(),
  currency: currencyCode.optional(),
  timelineHint: z.string().trim().max(200).default(''),
  tone: z.enum(['professional', 'friendly', 'concise']).default('professional'),
})

const id = (value: unknown) => z.uuid('Invalid id.').parse(value)

async function assertOwnClient(clientId: string, userId: string) {
  const { rows } = await pool.query('SELECT name FROM clients WHERE id = $1 AND user_id = $2', [clientId, userId])
  if (!rows[0]) throw new HttpError(400, 'Choose one of your clients.')
  return rows[0].name as string
}

async function loadProposal(proposalId: string, userId: string) {
  const { rows } = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = $1 AND p.user_id = $2`, [proposalId, userId])
  if (!rows[0]) throw new HttpError(404, 'Proposal not found.')
  return rows[0]
}

/** Column values in the order used by both INSERT and UPDATE below. */
function contentValues(p: ProposalInput, currency: string) {
  return [
    p.clientId, p.title, currency, p.budget, p.brief, p.summary, p.scope,
    JSON.stringify(p.deliverables), JSON.stringify(p.timeline),
    // Same safety net as the AI path: line items always add up to the budget.
    JSON.stringify(normalizePricing(p.pricing, p.budget)),
    JSON.stringify(p.questions), p.terms, p.aiGenerated,
  ]
}

// GET /api/proposals
proposalsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(`${PROPOSAL_SELECT} WHERE p.user_id = $1 ORDER BY p.updated_at DESC`, [req.userId])
  res.json({ proposals: rows })
})

// POST /api/proposals/generate  -> AI writes a draft. NOTHING is saved; the person reviews and saves it.
proposalsRouter.post('/generate', async (req, res) => {
  const input = generateSchema.parse(req.body)
  const settings = await getSettings(req.userId)
  const { rows } = await pool.query('SELECT name, title FROM users WHERE id = $1', [req.userId])
  const clientName = input.clientId ? await assertOwnClient(input.clientId, req.userId) : ''

  // Every call that reaches the AI costs real money, so each person gets a limited number per hour.
  // This check comes AFTER validation: a request that was going to be rejected anyway is not counted.
  const perHour = Number(process.env.AI_PROPOSALS_PER_HOUR) || 10
  checkRateLimit(`ai-proposal:${req.userId}`, perHour, 60 * 60 * 1000, 'AI proposals this hour')

  const proposal = await generateProposal({
    freelancerName: rows[0].name,
    freelancerTitle: rows[0].title,
    businessName: settings.businessName,
    clientName,
    jobTitle: input.jobTitle,
    description: input.description,
    requirements: input.requirements,
    budget: input.budget || null,
    currency: input.currency ?? settings.currency,
    timelineHint: input.timelineHint,
    tone: input.tone,
    paymentTermsDays: settings.paymentTermsDays,
  })
  res.json({ proposal })
})

// GET /api/proposals/:id
proposalsRouter.get('/:id', async (req, res) => {
  res.json({ proposal: await loadProposal(id(req.params.id), req.userId) })
})

// POST /api/proposals
proposalsRouter.post('/', async (req, res) => {
  const p = proposalSchema.parse(req.body)
  await assertOwnClient(p.clientId, req.userId)
  const { currency: home } = await getSettings(req.userId)
  const { rows } = await pool.query(
    `INSERT INTO proposals (user_id, client_id, title, currency, budget, brief, summary, scope,
                            deliverables, timeline, pricing, questions, terms, ai_generated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)
     RETURNING id`,
    [req.userId, ...contentValues(p, p.currency ?? home)],
  )
  res.status(201).json({ proposal: await loadProposal(rows[0].id, req.userId) })
})

// PUT /api/proposals/:id  -> draft and sent proposals can be edited; accepted/declined are final
proposalsRouter.put('/:id', async (req, res) => {
  const proposalId = id(req.params.id)
  const p = proposalSchema.parse(req.body)
  await assertOwnClient(p.clientId, req.userId)
  const existing = await loadProposal(proposalId, req.userId)
  if (existing.status === 'accepted' || existing.status === 'declined') {
    throw new HttpError(409, `A proposal that has been ${existing.status} can no longer be edited.`)
  }
  await pool.query(
    `UPDATE proposals SET client_id = $3, title = $4, currency = $5, budget = $6, brief = $7, summary = $8, scope = $9,
            deliverables = $10::jsonb, timeline = $11::jsonb, pricing = $12::jsonb, questions = $13::jsonb,
            terms = $14, ai_generated = $15, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [proposalId, req.userId, ...contentValues(p, p.currency ?? existing.currency)],
  )
  res.json({ proposal: await loadProposal(proposalId, req.userId) })
})

// Which status changes are allowed.
const TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'draft'],
  declined: ['draft'],
  accepted: [],
}

// PATCH /api/proposals/:id/status   body: { status }
proposalsRouter.patch('/:id/status', async (req, res) => {
  const proposalId = id(req.params.id)
  const { status } = z.object({ status: z.enum(['draft', 'sent', 'accepted', 'declined']) }).parse(req.body)
  const existing = await loadProposal(proposalId, req.userId)
  if (!TRANSITIONS[existing.status].includes(status)) {
    throw new HttpError(409, `A ${existing.status} proposal cannot be changed to ${status}.`)
  }
  await pool.query(
    `UPDATE proposals SET status = $3,
            sent_at = CASE WHEN $3 = 'sent' THEN now() WHEN $3 = 'draft' THEN NULL ELSE sent_at END,
            responded_at = CASE WHEN $3 IN ('accepted', 'declined') THEN now() ELSE NULL END,
            updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [proposalId, req.userId, status],
  )
  res.json({ proposal: await loadProposal(proposalId, req.userId) })
})

// DELETE /api/proposals/:id  -> drafts and declined proposals only
proposalsRouter.delete('/:id', async (req, res) => {
  const proposal = await loadProposal(id(req.params.id), req.userId)
  if (proposal.status !== 'draft' && proposal.status !== 'declined') {
    throw new HttpError(409, 'Only draft or declined proposals can be deleted.')
  }
  await pool.query('DELETE FROM proposals WHERE id = $1 AND user_id = $2', [proposal.id, req.userId])
  res.status(204).end()
})

// POST /api/proposals/:id/convert  -> an ACCEPTED proposal becomes a real project, its deliverables become tasks
proposalsRouter.post('/:id/convert', async (req, res) => {
  const proposalId = id(req.params.id)
  const proposal = await loadProposal(proposalId, req.userId)
  if (proposal.status !== 'accepted') throw new HttpError(409, 'Only an accepted proposal can be turned into a project.')
  if (proposal.projectId) throw new HttpError(409, 'This proposal has already been turned into a project.')

  // Project budgets are always in the account's home currency.
  const { currency: home } = await getSettings(req.userId)
  const budget = proposal.currency === home ? proposal.budget : round2(proposal.budget * (await getRate(proposal.currency, home)).rate)

  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const locked = await db.query('SELECT project_id FROM proposals WHERE id = $1 AND user_id = $2 FOR UPDATE', [proposalId, req.userId])
    if (locked.rows[0]?.project_id) throw new HttpError(409, 'This proposal has already been turned into a project.')

    const project = await db.query(
      `INSERT INTO projects (user_id, client_id, name, description, status, budget)
       VALUES ($1, $2, $3, $4, 'not_started', $5) RETURNING id`,
      [req.userId, proposal.clientId, proposal.title, proposal.summary, budget],
    )
    const titles = (proposal.deliverables as string[]).map((t) => t.slice(0, 200))
    if (titles.length > 0) {
      await db.query(
        `INSERT INTO tasks (user_id, project_id, title) SELECT $1, $2, t FROM unnest($3::text[]) AS t`,
        [req.userId, project.rows[0].id, titles],
      )
    }
    await db.query('UPDATE proposals SET project_id = $3, updated_at = now() WHERE id = $1 AND user_id = $2', [
      proposalId, req.userId, project.rows[0].id,
    ])
    await db.query('COMMIT')
    res.status(201).json({ proposal: await loadProposal(proposalId, req.userId), projectId: project.rows[0].id })
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    db.release()
  }
})
