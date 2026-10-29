import { api } from '@/lib/api'
import type { PaystackConnection, Settings } from '@/types/settings'

export interface SettingsResponse {
  settings: Settings
  /** true once the account has invoices, payments, expenses or projects */
  currencyLocked: boolean
}

export const getSettings = () => api<SettingsResponse>('/settings')

export const saveSettings = (settings: Settings) =>
  api<SettingsResponse>('/settings', { method: 'PUT', body: settings })

export const getPaystack = () => api<PaystackConnection>('/settings/paystack')

/** The server checks the key with Paystack before saving it (encrypted). */
export const connectPaystack = (secretKey: string) =>
  api<PaystackConnection>('/settings/paystack', { method: 'PUT', body: { secretKey } })

export const disconnectPaystack = () => api<void>('/settings/paystack', { method: 'DELETE' })
