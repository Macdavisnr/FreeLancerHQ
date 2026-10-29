import { api } from '@/lib/api'
import type { AppNotification } from '@/types/notification'

export const listNotifications = () =>
  api<{ notifications: AppNotification[]; unreadCount: number }>('/notifications')

export const markNotificationRead = (id: string) => api<void>(`/notifications/${id}/read`, { method: 'POST' })

export const markAllNotificationsRead = () => api<void>('/notifications/read-all', { method: 'POST' })
