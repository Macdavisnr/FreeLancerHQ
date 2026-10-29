import bcrypt from 'bcryptjs'
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, signResetToken, signSignupToken, signToken, verifyResetToken, verifySignupToken } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { currencyCode } from '../currencies.js'
import { canExposeDevCode, sendOtp } from '../notify.js'
import { maskEmail, maskPhone, normalizePhone, PHONE_ERROR } from '../phone.js'
import { USER_COLUMNS } from '../users.js'

export const authRouter = Router()

const OTP_LIFETIME_MINUTES = 10
const RESEND_COOLDOWN_SECONDS = 30
const MAX_WRONG_ATTEMPTS = 5
const MAX_RESENDS = 5

/*
 * SIGN-UP IS THREE STEPS, and the account only exists after the last one:
 *   1. POST /register/start     name + email (+ phone) -> a 6-digit code is sent
 *   2. POST /register/verify    the code               -> a short-lived "verified" token
 *      POST /register/resend    (if the code never arrived)
 *   3. POST /register/complete  verified token + password + confirm -> account created, logged in
 * Between the steps, the in-progress sign-up lives in the signup_verifications table.
 */

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0') // cryptographically random, 000000-999999
}

/** We store a keyed hash of the code, so a leaked database does not leak usable codes. */
function hashCode(email: string, code: string) {
  return createHmac('sha256', process.env.JWT_SECRET!).update(`${email}:${code}`).digest('hex')
}

function codeMatches(email: string, code: string, storedHash: string) {
  const a = Buffer.from(hashCode(email, code), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b) // constant-time comparison
}

const startSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  phone: z.string().trim().default(''),
  channel: z.enum(['email', 'phone']).default('email'),
  // The account's home currency. Chosen once, here.
  currency: currencyCode.default('USD'),
})

const verifySchema = z.object({
  signupId: z.uuid('This sign-up is no longer valid. Please start again.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
})

const completeSchema = z.object({
  signupToken: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string(),
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
})

/** Create + send a fresh code for a pending sign-up row; returns what the app needs to show. */
async function issueCode(row: { id: string; email: string; phone: string; channel: 'email' | 'phone' }) {
  const code = generateCode()
  await pool.query(
    `UPDATE signup_verifications
     SET code_hash = $2, expires_at = now() + make_interval(mins => $3), attempts = 0, last_sent_at = now()
     WHERE id = $1`,
    [row.id, hashCode(row.email, code), OTP_LIFETIME_MINUTES],
  )
  const destination = row.channel === 'email' ? row.email : row.phone
  let delivery
  try {
    delivery = await sendOtp(row.channel, destination, code)
  } catch (err) {
    console.error('OTP delivery failed:', err)
    throw new HttpError(502, 'We could not send the code. Please try again in a moment.')
  }
  return {
    signupId: row.id,
    channel: row.channel,
    destination: row.channel === 'email' ? maskEmail(row.email) : maskPhone(row.phone),
    expiresInSeconds: OTP_LIFETIME_MINUTES * 60,
    resendInSeconds: RESEND_COOLDOWN_SECONDS,
    ...(canExposeDevCode(delivery) && { devCode: code }),
  }
}

// STEP 1: POST /api/auth/register/start
authRouter.post('/register/start', async (req, res) => {
  const input = startSchema.parse(req.body)

  let phone = ''
  if (input.phone) {
    const normalized = normalizePhone(input.phone)
    if (!normalized) throw new HttpError(400, PHONE_ERROR)
    phone = normalized
  }
  if (input.channel === 'phone' && !phone) {
    throw new HttpError(400, 'Enter your phone number to receive the code by SMS.')
  }

  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [input.email])
  if (existing.rowCount) throw new HttpError(409, 'An account with this email already exists.')

  // Starting again for the same email replaces the earlier attempt, but not more than once per 30s
  // (stops anyone using this endpoint to spam someone's inbox).
  const pending = await pool.query(
    `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (last_sent_at + make_interval(secs => $2) - now()))))::int AS wait
     FROM signup_verifications WHERE email = $1`,
    [input.email, RESEND_COOLDOWN_SECONDS],
  )
  if (pending.rows[0]?.wait > 0) {
    throw new HttpError(429, `Please wait ${pending.rows[0].wait} seconds before requesting another code.`)
  }

  // Tidy up abandoned sign-ups older than a day.
  await pool.query(`DELETE FROM signup_verifications WHERE created_at < now() - interval '1 day'`)

  const { rows } = await pool.query(
    `INSERT INTO signup_verifications (name, email, phone, channel, currency, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', now())
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, phone = EXCLUDED.phone, channel = EXCLUDED.channel,
           currency = EXCLUDED.currency, verified_at = NULL, resend_count = 0, created_at = now()
     RETURNING id, email, phone, channel`,
    [input.name, input.email, phone, input.channel, input.currency],
  )
  res.status(201).json(await issueCode(rows[0]))
})

// STEP 2: POST /api/auth/register/verify
authRouter.post('/register/verify', async (req, res) => {
  const { signupId, code } = verifySchema.parse(req.body)
  const { rows } = await pool.query(
    'SELECT id, email, code_hash, attempts, (expires_at < now()) AS expired FROM signup_verifications WHERE id = $1',
    [signupId],
  )
  const row = rows[0]
  if (!row) throw new HttpError(400, 'This sign-up has expired. Please start again.')
  if (row.expired) throw new HttpError(400, 'This code has expired. Request a new one.')
  if (row.attempts >= MAX_WRONG_ATTEMPTS) {
    throw new HttpError(429, 'Too many wrong attempts. Request a new code.')
  }

  if (!codeMatches(row.email, code, row.code_hash)) {
    await pool.query('UPDATE signup_verifications SET attempts = attempts + 1 WHERE id = $1', [signupId])
    const left = MAX_WRONG_ATTEMPTS - row.attempts - 1
    throw new HttpError(400, left > 0 ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.')
  }

  await pool.query('UPDATE signup_verifications SET verified_at = now() WHERE id = $1', [signupId])
  res.json({ signupToken: signSignupToken(signupId) })
})

// POST /api/auth/register/resend
authRouter.post('/register/resend', async (req, res) => {
  const { signupId } = z.object({ signupId: z.uuid() }).parse(req.body)
  const { rows } = await pool.query(
    `SELECT id, email, phone, channel, resend_count, verified_at,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (last_sent_at + make_interval(secs => $2) - now()))))::int AS wait
     FROM signup_verifications WHERE id = $1`,
    [signupId, RESEND_COOLDOWN_SECONDS],
  )
  const row = rows[0]
  if (!row) throw new HttpError(400, 'This sign-up has expired. Please start again.')
  if (row.verified_at) throw new HttpError(409, 'Already verified.')
  if (row.wait > 0) throw new HttpError(429, `Please wait ${row.wait} seconds before requesting another code.`)
  if (row.resend_count >= MAX_RESENDS) throw new HttpError(429, 'Too many codes requested. Please start again later.')

  await pool.query('UPDATE signup_verifications SET resend_count = resend_count + 1 WHERE id = $1', [signupId])
  res.json(await issueCode(row))
})

// STEP 3: POST /api/auth/register/complete  -> only now is the account created
authRouter.post('/register/complete', async (req, res) => {
  const { signupToken, password, confirmPassword } = completeSchema.parse(req.body)
  if (password !== confirmPassword) throw new HttpError(400, 'Passwords do not match.')

  const signupId = verifySignupToken(signupToken)
  const { rows } = await pool.query(
    'SELECT name, email, phone, channel, currency, verified_at FROM signup_verifications WHERE id = $1',
    [signupId],
  )
  const signup = rows[0]
  if (!signup || !signup.verified_at) throw new HttpError(400, 'Please verify your code first.')

  const passwordHash = await bcrypt.hash(password, 10)
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    // The channel the code went to is the one we have proven the person controls.
    const created = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, email_verified, phone_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${USER_COLUMNS}`,
      [signup.name, signup.email, signup.phone, passwordHash, signup.channel === 'email', signup.channel === 'phone'],
    )
    const user = created.rows[0]
    // The account's currency is fixed from day one.
    await db.query('INSERT INTO user_settings (user_id, currency) VALUES ($1, $2)', [user.id, signup.currency])
    await db.query('DELETE FROM signup_verifications WHERE id = $1', [signupId])
    await db.query('COMMIT')
    res.status(201).json({ token: signToken(user.id), user })
  } catch (err) {
    await db.query('ROLLBACK')
    // 23505 = unique violation: somebody registered this email in the meantime
    if ((err as { code?: string }).code === '23505') {
      throw new HttpError(409, 'An account with this email already exists.')
    }
    throw err
  } finally {
    db.release()
  }
})

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)

  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  )
  const row = rows[0]

  // Same message for "no such email" and "wrong password" so attackers can't probe which emails exist.
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, 'Incorrect email or password.')
  }

  const { password_hash: _hash, ...user } = row
  res.json({ token: signToken(user.id), user })
})

// GET /api/auth/me  (protected) - "who am I?", used when the app first loads
authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.userId])
  if (!rows[0]) throw new HttpError(401, 'Account no longer exists.')
  res.json({ user: rows[0] })
})

/*
 * FORGOT PASSWORD is also three steps, reusing the sign-up code machinery:
 *   1. POST /password/forgot   email          -> a 6-digit code is emailed (if the account exists)
 *      (calling it again is how "resend" works)
 *   2. POST /password/verify   email + code   -> a short-lived "reset" token
 *   3. POST /password/reset    token + new password + confirm -> password saved, logged in
 *
 * Step 1 answers EXACTLY the same whether or not the email has an account, so nobody can use it
 * to find out who is a customer ("account enumeration").
 */

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
})

const resetVerifySchema = forgotSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
})

const resetSchema = z.object({
  resetToken: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string(),
})

// hashCode() mixes in a label, so a reset code can never be replayed as a sign-up code (or vice versa).
const resetKey = (email: string) => `reset:${email}`

const WRONG_RESET_CODE = 'That code is not correct. Check it or request a new one.'

// STEP 1: POST /api/auth/password/forgot
authRouter.post('/password/forgot', async (req, res) => {
  const { email } = forgotSchema.parse(req.body)
  const reply = {
    destination: maskEmail(email),
    expiresInSeconds: OTP_LIFETIME_MINUTES * 60,
    resendInSeconds: RESEND_COOLDOWN_SECONDS,
  }

  const { rows } = await pool.query(
    `SELECT u.id, r.send_count,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.last_sent_at + make_interval(secs => $2) - now()))))::int AS wait,
            (r.created_at < now() - interval '1 hour') AS stale
     FROM users u LEFT JOIN password_resets r ON r.user_id = u.id
     WHERE u.email = $1`,
    [email, RESEND_COOLDOWN_SECONDS],
  )
  const user = rows[0]
  // Unknown email, still in the 30s cooldown, or too many codes this hour: quietly send nothing.
  // Returning an error here would reveal that the account exists.
  if (!user || user.wait > 0 || (user.send_count >= MAX_RESENDS && !user.stale)) {
    res.json(reply)
    return
  }

  const code = generateCode()
  // Upsert: a fresh request replaces the old code. The hourly send counter restarts after an hour.
  await pool.query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0,
           verified_at = NULL, last_sent_at = now(),
           send_count = CASE WHEN password_resets.created_at < now() - interval '1 hour' THEN 1
                             ELSE password_resets.send_count + 1 END,
           created_at = CASE WHEN password_resets.created_at < now() - interval '1 hour' THEN now()
                             ELSE password_resets.created_at END`,
    [user.id, hashCode(resetKey(email), code), OTP_LIFETIME_MINUTES],
  )

  let delivery
  try {
    delivery = await sendOtp('email', email, code, 'reset')
  } catch (err) {
    console.error('Password reset delivery failed:', err)
    throw new HttpError(502, 'We could not send the code. Please try again in a moment.')
  }
  res.json({ ...reply, ...(canExposeDevCode(delivery) && { devCode: code }) })
})

// STEP 2: POST /api/auth/password/verify
authRouter.post('/password/verify', async (req, res) => {
  const { email, code } = resetVerifySchema.parse(req.body)
  const { rows } = await pool.query(
    `SELECT r.user_id, r.code_hash, r.attempts, (r.expires_at < now()) AS expired
     FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE u.email = $1`,
    [email],
  )
  const row = rows[0]
  // No reset in progress looks the same as a wrong code (again: don't reveal who has an account).
  if (!row) throw new HttpError(400, WRONG_RESET_CODE)
  if (row.expired) throw new HttpError(400, 'This code has expired. Request a new one.')
  if (row.attempts >= MAX_WRONG_ATTEMPTS) throw new HttpError(429, 'Too many wrong attempts. Request a new code.')

  if (!codeMatches(resetKey(email), code, row.code_hash)) {
    await pool.query('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = $1', [row.user_id])
    // Unlike sign-up, no "N attempts left": that would differ from the unknown-email answer above.
    throw new HttpError(400, WRONG_RESET_CODE)
  }

  await pool.query('UPDATE password_resets SET verified_at = now() WHERE user_id = $1', [row.user_id])
  res.json({ resetToken: signResetToken(row.user_id) })
})

// STEP 3: POST /api/auth/password/reset
authRouter.post('/password/reset', async (req, res) => {
  const { resetToken, password, confirmPassword } = resetSchema.parse(req.body)
  if (password !== confirmPassword) throw new HttpError(400, 'Passwords do not match.')
  const userId = verifyResetToken(resetToken)

  // Deleting the reset row is what makes the token single-use: if no verified row was deleted,
  // this token was already used (or a newer code was requested since).
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const used = await db.query(
      'DELETE FROM password_resets WHERE user_id = $1 AND verified_at IS NOT NULL RETURNING 1',
      [userId],
    )
    if (!used.rowCount) throw new HttpError(400, 'This code has already been used. Please request a new one.')
    // Receiving the code proves they control the email, so mark it verified too.
    const updated = await db.query(
      `UPDATE users SET password_hash = $2, email_verified = true, updated_at = now()
       WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [userId, await bcrypt.hash(password, 10)],
    )
    await db.query('COMMIT')
    res.json({ token: signToken(userId), user: updated.rows[0] })
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    db.release()
  }
})
