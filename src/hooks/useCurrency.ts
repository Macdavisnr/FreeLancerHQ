import { useContext } from 'react'
import { CurrencyContext } from '@/lib/currency-context'

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used inside the signed-in layout')
  return ctx
}
