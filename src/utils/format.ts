/*
 * Money and dates are shown the way the VISITOR's browser prefers (their language and region),
 * and money uses the currency chosen in Settings. Nothing is hard-coded to one country.
 */

let activeCurrency = 'USD'

/** Called once the user's settings are loaded (and again if they change the currency). */
export function setActiveCurrency(code: string) {
  activeCurrency = code
}

export const getActiveCurrency = () => activeCurrency

const formatters = new Map<string, Intl.NumberFormat>()

function numberFormat(currency: string, options: Intl.NumberFormatOptions, key: string) {
  const cacheKey = `${currency}|${key}`
  let formatter = formatters.get(cacheKey)
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol', // ₦, $, €, £ ... instead of "NGN", "US$"
      ...options,
    })
    formatters.set(cacheKey, formatter)
  }
  return formatter
}

/**
 * 1850000 -> "₦1,850,000" / "$1,850,000" / "1.850.000 €", depending on currency and locale.
 * Without a currency it uses the account's home currency; invoices pass their own.
 */
export function formatCurrency(amount: number, currency: string = activeCurrency) {
  const whole = Number.isInteger(amount) // keep whole amounts tidy: no ".00"
  return numberFormat(
    currency,
    { minimumFractionDigits: whole ? 0 : undefined, maximumFractionDigits: 2 },
    whole ? 'whole' : 'fraction',
  ).format(amount)
}

/** 1850000 -> "₦1.85M", 780000 -> "₦780K" (for chart labels). */
export function formatCompactCurrency(amount: number, currency: string = activeCurrency) {
  return numberFormat(currency, { notation: 'compact', maximumFractionDigits: 2 }, 'compact').format(amount)
}

/** Just the symbol, for form labels such as "Budget (₦)". */
export function currencySymbol(currency: string = activeCurrency) {
  return (
    numberFormat(currency, {}, 'symbol')
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency
  )
}

/** Is this a currency other than the account's home currency? */
export const isForeignCurrency = (currency: string) => currency !== activeCurrency

export function formatMonthYear(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** '2026-10-16' -> '16 Oct 2026'. Parsed by hand so the timezone can never shift the day. */
export function formatDate(date: string | null) {
  if (!date) return '—'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Whole days from today until the given 'YYYY-MM-DD' date (negative = overdue). */
export function daysUntil(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000)
}

/** '2026-10-30' -> '30 Oct' (no year), for compact labels. */
export function formatShortDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** A task's due date in words: "Due today", "Due tomorrow", "Due 30 Oct", "2 days overdue". */
export function describeDue(date: string) {
  const days = daysUntil(date)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `Due ${formatShortDate(date)}`
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`
}

export function describeDeadline(date: string | null) {
  if (!date) return 'No deadline'
  const days = daysUntil(date)
  if (days === 0) return 'Due today'
  if (days === 1) return '1 day left'
  if (days > 1) return `${days} days left`
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`
}

/** Today as 'YYYY-MM-DD' in the user's own timezone. */
export function todayISO(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 2_400_000 -> "2.3 MB" */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
