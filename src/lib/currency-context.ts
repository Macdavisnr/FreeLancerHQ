import { createContext } from 'react'

export interface CurrencyContextValue {
  currency: string
  /** Call after the user saves a new currency in Settings so the whole app re-renders with it. */
  changeCurrency: (code: string) => void
}

export const CurrencyContext = createContext<CurrencyContextValue | null>(null)
