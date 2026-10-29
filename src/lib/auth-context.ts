import { createContext } from 'react'
import type { LoginInput, PasswordResetInput, SignupCompleteInput, User } from '@/types/auth'

export interface AuthContextValue {
  user: User | null
  /** true until we have checked whether someone is already signed in */
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  /** Final sign-up step: create the account (after the code is verified) and sign in. */
  completeSignup: (input: SignupCompleteInput) => Promise<void>
  /** Final forgot-password step: save the new password and sign in. */
  resetPassword: (input: PasswordResetInput) => Promise<void>
  logout: () => Promise<void>
  /** Replace the signed-in user's details after they edit their profile. */
  updateUser: (user: User) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
