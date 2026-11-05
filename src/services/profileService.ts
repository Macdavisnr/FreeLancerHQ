import { api, tokenStore } from '@/lib/api'
import type { User } from '@/types/auth'

export type ProfileInput = Pick<User, 'name' | 'title' | 'email' | 'phone' | 'bio'>

export async function updateProfile(input: ProfileInput): Promise<User> {
  const { user } = await api<{ user: User }>('/profile', { method: 'PUT', body: input })
  return user
}

/** Changing the password logs out every other device. This one gets a new token so it stays logged in. */
export async function changePassword(currentPassword: string, newPassword: string) {
  const { token } = await api<{ token: string }>('/profile/password', { method: 'PUT', body: { currentPassword, newPassword } })
  tokenStore.set(token)
}
