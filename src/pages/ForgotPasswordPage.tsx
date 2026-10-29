import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import OtpInput from '@/components/OtpInput'
import StepIndicator from '@/components/StepIndicator'
import SubmitButton from '@/components/SubmitButton'
import TextField from '@/components/TextField'
import { useAuth } from '@/hooks/useAuth'
import { requestPasswordReset, verifyPasswordReset } from '@/services/authService'
import type { PasswordResetSession } from '@/types/auth'

type Step = 'email' | 'verify' | 'password'

const STEPS: { key: Step; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'verify', label: 'Verify' },
  { key: 'password', label: 'New password' },
]

const OTP_LENGTH = 6

/*
 * Same three-step shape as sign-up: email -> code -> new password.
 * Unlike sign-up nothing is kept in sessionStorage: if the page is refreshed, the person simply
 * asks for a new code.
 */
export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [session, setSession] = useState<PasswordResetSession | null>(null)
  const [code, setCode] = useState('')
  const [otpKey, setOtpKey] = useState(0) // bump to reset + refocus the code boxes
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  // Tick once a second on the verify step so the "resend in 24s" countdown moves.
  useEffect(() => {
    if (step !== 'verify') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [step])

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000))

  /** Run an async step with shared busy/error handling. Returns true if it succeeded. */
  async function run(action: () => Promise<void>) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function sendCode() {
    const sent = await requestPasswordReset(email)
    setSession(sent)
    setCode('')
    setOtpKey((k) => k + 1)
    setNow(Date.now())
    setResendAt(Date.now() + sent.resendInSeconds * 1000)
  }

  // STEP 1: ask for a code
  async function handleEmail(e: FormEvent) {
    e.preventDefault()
    const ok = await run(sendCode)
    if (ok) setStep('verify')
  }

  // STEP 2: check the code
  async function handleVerify(value: string) {
    if (value.length !== OTP_LENGTH || busy) return
    const ok = await run(async () => {
      setResetToken(await verifyPasswordReset(email, value))
      setStep('password')
    })
    if (!ok) {
      setCode('')
      setOtpKey((k) => k + 1)
    }
  }

  async function handleResend() {
    const ok = await run(sendCode)
    if (ok) setNotice('If an account exists, a new code has been sent.')
  }

  // STEP 3: save the new password (this also logs the person in)
  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const ok = await run(() => resetPassword({ resetToken, password, confirmPassword: confirm }))
    if (ok) navigate('/dashboard', { replace: true })
  }

  const errorBox = error && (
    <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </p>
  )

  // ---------------------------------------------------------------- STEP 1
  if (step === 'email' || !session) {
    return (
      <>
        <BackLink to="/login" label="Back to login" className="mb-8" />
        <h1 className="text-3xl font-extrabold tracking-tight">Forgot password?</h1>
        <p className="mb-6 text-muted">Enter the email you signed up with and we&apos;ll send you a code to reset it.</p>
        <StepIndicator steps={STEPS} current="email" />

        <form onSubmit={handleEmail}>
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {errorBox}
          <SubmitButton loading={busy} loadingText="Sending code…">
            Send reset code
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-muted">
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand-700">
            Log in
          </Link>
        </p>
      </>
    )
  }

  // ---------------------------------------------------------------- STEP 2
  if (step === 'verify') {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setError('')
            setNotice('')
            setStep('email')
          }}
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Use a different email
        </button>
        <h1 className="text-3xl font-extrabold tracking-tight">Check your email</h1>
        <p className="mb-6 text-muted">
          If an account exists for <span className="font-semibold text-ink">{session.destination}</span>, we sent it a{' '}
          {OTP_LENGTH}-digit code. It expires in {Math.round(session.expiresInSeconds / 60)} minutes.
        </p>
        <StepIndicator steps={STEPS} current="verify" />

        {session.devCode && (
          <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-bold">Development mode:</span> no email provider is configured, so nothing was really
            sent. Your code is <span className="font-mono text-base font-extrabold tracking-widest">{session.devCode}</span>.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleVerify(code)
          }}
        >
          <div className="mb-4">
            <OtpInput
              key={otpKey}
              value={code}
              onChange={(v) => {
                setCode(v)
                setError('')
              }}
              onComplete={handleVerify}
              length={OTP_LENGTH}
              disabled={busy}
              hasError={Boolean(error)}
            />
          </div>
          {errorBox}
          {notice && <p className="mb-4 text-sm font-semibold text-emerald-700">{notice}</p>}
          <SubmitButton loading={busy} loadingText="Verifying…">
            Verify code
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-muted">
          Didn&apos;t get it?{' '}
          {secondsLeft > 0 ? (
            <span>Resend code in {secondsLeft}s</span>
          ) : (
            <button type="button" onClick={handleResend} disabled={busy} className="font-semibold text-brand-700 disabled:opacity-60">
              Resend code
            </button>
          )}
        </p>
      </>
    )
  }

  // ---------------------------------------------------------------- STEP 3
  const mismatch = confirm !== '' && password !== confirm
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Choose a new password</h1>
      <p className="mb-6 text-muted">
        <span className="font-semibold text-emerald-700">✓ Code verified.</span> Set a new password for {email}.
      </p>
      <StepIndicator steps={STEPS} current="password" />

      <form onSubmit={handlePassword}>
        <TextField
          label="New password"
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError('')
          }}
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          placeholder="Type it again"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError('')
          }}
          required
        />
        {mismatch && <p className="-mt-2 mb-4 text-sm text-red-600">Passwords do not match.</p>}
        {confirm !== '' && !mismatch && password.length >= 8 && (
          <p className="-mt-2 mb-4 text-sm font-semibold text-emerald-700">✓ Passwords match</p>
        )}
        {errorBox}
        <SubmitButton loading={busy} loadingText="Saving…">
          Save password and log in
        </SubmitButton>
      </form>
    </>
  )
}
