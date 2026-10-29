import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from '@/lib/auth-context'
import * as authService from '@/services/authService'
import type { User } from '@/types/auth'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On first load, check whether a session already exists.
  useEffect(() => {
    authService
      .getCurrentUser()
      .catch(() => null) // server unreachable: show the login page instead of hanging
      .then((u) => {
        setUser(u)
        setLoading(false)
      })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (input) => setUser(await authService.login(input)),
      completeSignup: async (input) => setUser(await authService.completeSignup(input)),
      resetPassword: async (input) => setUser(await authService.resetPassword(input)),
      updateUser: setUser,
      logout: async () => {
        await authService.logout()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
