import { api, ApiError, tokenStore } from '@/lib/api'
import type {
  LoginInput,
  PasswordResetInput,
  PasswordResetSession,
  SignupCompleteInput,
  SignupSession,
  SignupStartInput,
  User,
} from '@/types/auth'

interface AuthResponse {
  token: string
  user: User
}

export async function getCurrentUser(): Promise<User | null> {
  if (!tokenStore.get()) return null
  try {
    const { user } = await api<{ user: User }>('/auth/me')
    return user
  } catch (err) {
    // Token expired or invalid: treat as signed out.
    if (err instanceof ApiError && err.status === 401) {
      tokenStore.clear()
      return null
    }
    throw err
  }
}

export async function login(input: LoginInput): Promise<User> {
  const { token, user } = await api<AuthResponse>('/auth/login', { method: 'POST', body: input })
  tokenStore.set(token)
  return user
}

/** Step 1: send a one-time code to the chosen email or phone. */
export const startSignup = (input: SignupStartInput) =>
  api<SignupSession>('/auth/register/start', { method: 'POST', body: input })

/** Step 2: check the code. Returns a short-lived token proving it was correct. */
export async function verifySignup(signupId: string, code: string): Promise<string> {
  const { signupToken } = await api<{ signupToken: string }>('/auth/register/verify', {
    method: 'POST',
    body: { signupId, code },
  })
  return signupToken
}

export const resendSignupCode = (signupId: string) =>
  api<SignupSession>('/auth/register/resend', { method: 'POST', body: { signupId } })

/** Step 3: set the password. The account is created and the person is logged in. */
export async function completeSignup(input: SignupCompleteInput): Promise<User> {
  const { token, user } = await api<AuthResponse>('/auth/register/complete', { method: 'POST', body: input })
  tokenStore.set(token)
  return user
}

/** Forgot password, step 1: email a reset code. Calling it again resends. */
export const requestPasswordReset = (email: string) =>
  api<PasswordResetSession>('/auth/password/forgot', { method: 'POST', body: { email } })

/** Step 2: check the code. Returns a short-lived token allowing the password to be changed. */
export async function verifyPasswordReset(email: string, code: string): Promise<string> {
  const { resetToken } = await api<{ resetToken: string }>('/auth/password/verify', {
    method: 'POST',
    body: { email, code },
  })
  return resetToken
}

/** Step 3: save the new password. The person is logged in straight away. */
export async function resetPassword(input: PasswordResetInput): Promise<User> {
  const { token, user } = await api<AuthResponse>('/auth/password/reset', { method: 'POST', body: input })
  tokenStore.set(token)
  return user
}

export async function logout(): Promise<void> {
  // With JWTs the server keeps no session, so logging out = forgetting the token.
  tokenStore.clear()
}
