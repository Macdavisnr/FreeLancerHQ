import { api } from '@/lib/api'
import type { User } from '@/types/auth'

export type ProfileInput = Pick<User, 'name' | 'title' | 'email' | 'phone' | 'bio'>

export async function updateProfile(input: ProfileInput): Promise<User> {
  const { user } = await api<{ user: User }>('/profile', { method: 'PUT', body: input })
  return user
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  api<void>('/profile/password', { method: 'PUT', body: { currentPassword, newPassword } })
