export interface User {
  id: string
  name: string
  email: string
  title: string
  phone: string
  bio: string
  emailVerified: boolean
  phoneVerified: boolean
  createdAt: string
}

export interface LoginInput {
  email: string
  password: string
}

/** Where the one-time code is sent. */
export type SignupChannel = 'email' | 'phone'

export interface SignupStartInput {
  name: string
  email: string
  phone: string
  channel: SignupChannel
  /** The account's home currency. Chosen once, here. */
  currency: string
}

/** What the server tells us after a code has been sent. */
export interface SignupSession {
  signupId: string
  channel: SignupChannel
  /** Masked, safe to show: "a••••@example.com" */
  destination: string
  expiresInSeconds: number
  resendInSeconds: number
  /** Only present in development when no email/SMS provider is configured. */
  devCode?: string
}

export interface SignupCompleteInput {
  signupToken: string
  password: string
  confirmPassword: string
}

/** What the server says after "forgot password". Identical whether or not the account exists. */
export interface PasswordResetSession {
  /** Masked, safe to show */
  destination: string
  expiresInSeconds: number
  resendInSeconds: number
  /** Only present in development when no email provider is configured. */
  devCode?: string
}

export interface PasswordResetInput {
  resetToken: string
  password: string
  confirmPassword: string
}
