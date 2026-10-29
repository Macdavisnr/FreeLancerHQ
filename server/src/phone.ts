// "max" metadata validates numbers properly for every country (the default build only checks length).
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/**
 * Accepts an international number ("+1 415 555 0132", "+44 7911 123456", "+234 803 000 1234")
 * and returns it in one standard form (E.164, e.g. +14155550132), or null if it is not a real
 * number. The app always sends the country code, so no country is ever assumed.
 */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim())
  return parsed?.isValid() ? parsed.number : null
}

export const PHONE_ERROR = 'Enter a valid phone number with its country code, e.g. +1 415 555 0132.'

export function maskPhone(phone: string) {
  return `${phone.slice(0, 4)} ••• ••• ${phone.slice(-3)}`
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 2))}@${domain}`
}
