import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CountryCode } from 'libphonenumber-js'
import BackLink from '@/components/BackLink'
import OtpInput from '@/components/OtpInput'
import PhoneField from '@/components/PhoneField'
import StepIndicator from '@/components/StepIndicator'
import SubmitButton from '@/components/SubmitButton'
import TextField from '@/components/TextField'
import { useAuth } from '@/hooks/useAuth'
import { guessCountry, joinPhone } from '@/lib/countries'
import { CURRENCY_OPTIONS } from '@/lib/currencies'
import { guessCurrency } from '@/lib/regionCurrency'
import { resendSignupCode, startSignup, verifySignup } from '@/services/authService'
import type { SignupChannel, SignupSession } from '@/types/auth'

type Step = 'details' | 'verify' | 'password'

interface SignupState {
  step: Step
  form: { name: string; email: string; phoneCountry: CountryCode; phoneNational: string; channel: SignupChannel; currency: string }
  session: SignupSession | null
  /** The details the current code was sent for, so going "back" and re-submitting unchanged doesn't resend. */
  sentFor: string
  signupToken: string
  /** When the next code may be requested (ms since epoch) */
  resendAt: number
}

const STORAGE_KEY = 'freelancehq.signup.v3'
const OTP_LENGTH = 6

const INITIAL: SignupState = {
  step: 'details',
  form: { name: '', email: '', phoneCountry: guessCountry(), phoneNational: '', channel: 'email', currency: guessCurrency() },
  session: null,
  sentFor: '',
  signupToken: '',
  resendAt: 0,
}

// Keep the sign-up in progress across a page refresh. Passwords are never stored.
function loadState(): SignupState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? { ...INITIAL, ...(JSON.parse(raw) as SignupState) } : INITIAL
  } catch {
    return INITIAL
  }
}

function saveState(state: SignupState | null) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: the flow still works, it just won't survive a refresh */
  }
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'verify', label: 'Verify' },
  { key: 'password', label: 'Password' },
]

export default function RegisterPage() {
  const { completeSignup } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<SignupState>(loadState)
  const [code, setCode] = useState('')
  const [otpKey, setOtpKey] = useState(0) // bump to reset + refocus the code boxes
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const { step, form, session } = state

  useEffect(() => {
    saveState(state)
  }, [state])

  // Tick once a second on the verify step so the "resend in 24s" countdown moves.
  useEffect(() => {
    if (step !== 'verify') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [step])

  const patch = (changes: Partial<SignupState>) => setState((s) => ({ ...s, ...changes }))
  const goTo = (next: Step) => {
    setError('')
    setNotice('')
    patch({ step: next })
  }
  const hasPhone = form.phoneNational.trim() !== ''
  const channel: SignupChannel = hasPhone ? form.channel : 'email'
  const secondsLeft = Math.max(0, Math.ceil((state.resendAt - now) / 1000))

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

  // STEP 1: send the code
  async function handleDetails(e: FormEvent) {
    e.preventDefault()
    const input = {
      name: form.name,
      email: form.email,
      phone: hasPhone ? joinPhone(form.phoneCountry, form.phoneNational) : '',
      channel,
      currency: form.currency,
    }
    const key = JSON.stringify(input)

    // Came back to edit nothing? Keep the code that was already sent.
    if (session && state.sentFor === key) {
      setCode('')
      goTo('verify')
      return
    }
    await run(async () => {
      const sent = await startSignup(input)
      setCode('')
      setOtpKey((k) => k + 1)
      setNow(Date.now())
      patch({
        step: 'verify',
        session: sent,
        sentFor: key,
        signupToken: '',
        resendAt: Date.now() + sent.resendInSeconds * 1000,
      })
    })
  }

  // STEP 2: check the code
  async function handleVerify(value: string) {
    if (!session || value.length !== OTP_LENGTH || busy) return
    const ok = await run(async () => {
      const signupToken = await verifySignup(session.signupId, value)
      patch({ step: 'password', signupToken })
    })
    if (!ok) {
      setCode('')
      setOtpKey((k) => k + 1)
    }
  }

  async function handleResend() {
    if (!session) return
    const ok = await run(async () => {
      const sent = await resendSignupCode(session.signupId)
      setNow(Date.now())
      patch({ session: sent, resendAt: Date.now() + sent.resendInSeconds * 1000 })
    })
    if (ok) {
      setCode('')
      setOtpKey((k) => k + 1)
      setNotice('A new code has been sent.')
    }
  }

  // STEP 3: choose a password, which creates the account
  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const ok = await run(async () => {
      await completeSignup({ signupToken: state.signupToken, password, confirmPassword: confirm })
    })
    if (ok) {
      saveState(null)
      navigate('/dashboard', { replace: true })
    }
  }

  const errorBox = error && (
    <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </p>
  )

  // ---------------------------------------------------------------- STEP 1
  if (step === 'details') {
    return (
      <>
        <BackLink to="/" label="Back to home" className="mb-8" />
        <h1 className="text-3xl font-extrabold tracking-tight">Create your account</h1>
        <p className="mb-6 text-muted">Start managing your freelance business.</p>
        <StepIndicator steps={STEPS} current="details" />

        <form onSubmit={handleDetails}>
          <TextField
            label="Full name"
            placeholder="David"
            autoComplete="name"
            value={form.name}
            onChange={(e) => patch({ form: { ...form, name: e.target.value } })}
            required
          />
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={form.email}
            onChange={(e) => patch({ form: { ...form, email: e.target.value } })}
            required
          />
          <PhoneField
            label="Phone (optional)"
            country={form.phoneCountry}
            national={form.phoneNational}
            onChange={(phoneCountry, phoneNational) => patch({ form: { ...form, phoneCountry, phoneNational } })}
          />

          <div className="mb-4">
            <label htmlFor="currency" className="mb-1.5 block text-sm font-semibold">Account currency</label>
            <select
              id="currency"
              value={form.currency}
              onChange={(e) => patch({ form: { ...form, currency: e.target.value } })}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-sm text-muted">
              The currency you get paid and report in. Clients can still pay in theirs, and it is converted for you. It
              cannot be changed once you start adding invoices.
            </p>
          </div>

          {hasPhone && (
            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-semibold">Send my verification code to</legend>
              <div className="grid grid-cols-2 gap-3">
                {(['email', 'phone'] as const).map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold ${
                      form.channel === option ? 'border-brand-600 bg-brand-50' : 'border-line'
                    }`}
                  >
                    <input
                      type="radio"
                      name="channel"
                      value={option}
                      checked={form.channel === option}
                      onChange={() => patch({ form: { ...form, channel: option } })}
                      className="accent-brand-600"
                    />
                    {option === 'email' ? 'My email' : 'My phone (SMS)'}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {errorBox}
          <SubmitButton loading={busy} loadingText="Sending code…">
            Send verification code
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700">
            Log in
          </Link>
        </p>
      </>
    )
  }

  // ---------------------------------------------------------------- STEP 2
  if (step === 'verify' && session) {
    return (
      <>
        <button
          type="button"
          onClick={() => goTo('details')}
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Change my details
        </button>
        <h1 className="text-3xl font-extrabold tracking-tight">Verify your {session.channel === 'email' ? 'email' : 'phone'}</h1>
        <p className="mb-6 text-muted">
          We sent a {OTP_LENGTH}-digit code to <span className="font-semibold text-ink">{session.destination}</span>.
          It expires in {Math.round(session.expiresInSeconds / 60)} minutes.
        </p>
        <StepIndicator steps={STEPS} current="verify" />

        {session.devCode && (
          <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-bold">Development mode:</span> no {session.channel === 'email' ? 'email' : 'SMS'} provider is
            configured, so nothing was really sent. Your code is{' '}
            <span className="font-mono text-base font-extrabold tracking-widest">{session.devCode}</span>.
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
  if (step === 'password' && state.signupToken) {
    const mismatch = confirm !== '' && password !== confirm
    return (
      <>
        <h1 className="text-3xl font-extrabold tracking-tight">Create your password</h1>
        <p className="mb-6 text-muted">
          <span className="font-semibold text-emerald-700">✓ {session?.channel === 'phone' ? 'Phone' : 'Email'} verified.</span>{' '}
          Last step: choose a password for {form.email}.
        </p>
        <StepIndicator steps={STEPS} current="password" />

        <form onSubmit={handlePassword}>
          <TextField
            label="Password"
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
            label="Confirm password"
            type="password"
            placeholder="Type your password again"
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
          <SubmitButton loading={busy} loadingText="Creating account…">
            Create account
          </SubmitButton>
        </form>
      </>
    )
  }

  // A saved session that no longer makes sense (e.g. cleared storage): start over.
  return (
    <>
      <p className="mb-4 text-muted">Your sign-up session was lost.</p>
      <button
        type="button"
        onClick={() => {
          saveState(null)
          setState(INITIAL)
        }}
        className="font-semibold text-brand-700"
      >
        Start again
      </button>
    </>
  )
}
