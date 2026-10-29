import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import SubmitButton from '@/components/SubmitButton'
import TextField from '@/components/TextField'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <BackLink to="/" label="Back to home" className="mb-8" />
      <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
      <p className="mb-6 text-muted">Log in to your workspace.</p>

      <form onSubmit={handleSubmit}>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="mb-4 text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700">
            Forgot password?
          </Link>
        </div>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <SubmitButton loading={submitting} loadingText="Logging in…">
          Log in
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-muted">
        No account yet?{' '}
        <Link to="/register" className="font-semibold text-brand-700">
          Create one
        </Link>
      </p>
    </>
  )
}
