import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/notificationService'
import type { AppNotification, NotificationKind } from '@/types/notification'

const POLL_MS = 60_000

const ICONS: Record<NotificationKind, { icon: string; tone: string }> = {
  invoice_paid: { icon: '✓', tone: 'bg-emerald-50 text-emerald-700' },
  invoice_viewed: { icon: '👁', tone: 'bg-violet-50 text-violet-700' },
  invoice_overdue: { icon: '!', tone: 'bg-red-50 text-red-700' },
  weekly_summary: { icon: '📊', tone: 'bg-brand-50 text-brand-700' },
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "5 minutes ago", "yesterday"... in the visitor's language. */
function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400], ['hour', 3_600], ['minute', 60]]
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  return relative.format(0, 'second')
}

/*
 * The bell in the top bar. It asks the server for news every minute (and whenever you come back
 * to the tab). That is called POLLING. The alternative, the server PUSHING updates instantly,
 * needs a connection kept open all the time (WebSockets / Server-Sent Events): more moving
 * parts, and not needed for alerts that can wait a minute.
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [version, setVersion] = useState(0) // bump to re-fetch now
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stale = false
    const load = () =>
      listNotifications()
        .then((data) => {
          if (stale) return
          setItems(data.notifications)
          setUnread(data.unreadCount)
        })
        .catch(() => {}) // a missed poll is harmless: the next one will catch up
    load()
    const timer = setInterval(load, POLL_MS)
    const onFocus = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      stale = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [version])

  // Close on a click outside the panel, or on Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function openItem(n: AppNotification) {
    setOpen(false)
    if (!n.readAt) {
      // Update the screen straight away, then tell the server.
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
      markNotificationRead(n.id).catch(() => setVersion((v) => v + 1))
    }
    if (n.link) navigate(n.link)
  }

  async function markAll() {
    setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })))
    setUnread(0)
    await markAllNotificationsRead().catch(() => setVersion((v) => v + 1))
  }

  return (
    <div ref={panel} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-muted hover:text-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-xs font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        // Phones: pinned to the screen with 16px margins. Larger screens: hangs under the bell.
        <div className="fixed inset-x-4 top-16 z-30 overflow-hidden rounded-2xl border border-line bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-bold">Notifications</h2>
            {unread > 0 && (
              <button onClick={markAll} className="text-sm font-semibold text-brand-700">Mark all as read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-[26rem] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-canvas ${n.readAt ? '' : 'bg-brand-50/50'}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ICONS[n.kind].tone}`} aria-hidden="true">
                      {ICONS[n.kind].icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.readAt ? '' : 'font-bold'}`}>{n.title}</span>
                      {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
