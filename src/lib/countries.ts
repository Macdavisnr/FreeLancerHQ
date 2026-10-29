import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js'

export interface Country {
  code: CountryCode
  name: string
  /** Calling code without the plus, e.g. "234" */
  dial: string
  flag: string
}

/** 🇳🇬 from "NG": flag emoji are just two "regional indicator" letters. */
const flagOf = (code: string) =>
  String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))

const regionNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'region' })

export const COUNTRIES: Country[] = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    dial: getCountryCallingCode(code),
    flag: flagOf(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** Best guess of the visitor's country from their browser language (en-NG -> NG), else US. */
export function guessCountry(): CountryCode {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    if (region && getCountries().includes(region as CountryCode)) return region as CountryCode
  } catch {
    /* fall through */
  }
  return 'US'
}

/**
 * Country + the number as people write it locally -> the standard international form
 * (+2348030001234). libphonenumber knows each country's rules, such as dropping the leading
 * 0 in Nigeria and the UK. Returns '' when nothing has been typed.
 */
export function joinPhone(country: CountryCode, national: string): string {
  const digits = national.replace(/\D/g, '')
  if (!digits) return ''
  return parsePhoneNumberFromString(national, country)?.number ?? `+${getCountryCallingCode(country)}${digits}`
}

/** The reverse, for showing a saved +2348030001234 in the country + number fields. */
export function splitPhone(e164: string, fallback: CountryCode): { country: CountryCode; national: string } {
  const parsed = e164 ? parsePhoneNumberFromString(e164) : undefined
  return parsed
    ? { country: parsed.country ?? fallback, national: parsed.nationalNumber }
    : { country: fallback, national: '' }
}
