import { z } from 'zod'

/** Every ISO 4217 currency code the runtime knows (USD, EUR, NGN, JPY...). */
export const CURRENCIES = new Set(Intl.supportedValuesOf('currency'))

/** A validated, upper-cased currency code. */
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine((c) => CURRENCIES.has(c), 'Choose a valid currency.')
