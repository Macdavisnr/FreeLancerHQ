import { api } from '@/lib/api'
import type { Report } from '@/types/report'

export const getReport = () => api<Report>('/reports')
