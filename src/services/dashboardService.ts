import { api } from '@/lib/api'
import type { Dashboard } from '@/types/dashboard'

export const getDashboard = () => api<Dashboard>('/dashboard')
