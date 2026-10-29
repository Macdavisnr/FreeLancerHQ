import { api } from '@/lib/api'

export interface Rate {
  from: string
  to: string
  /** 1 unit of `from` = `rate` units of `to` */
  rate: number
  fetchedAt: string
  /** true when the rate source was unreachable and an older rate is being used */
  stale: boolean
  attribution: string
}

export const getRate = (from: string, to: string) =>
  api<Rate>(`/rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
