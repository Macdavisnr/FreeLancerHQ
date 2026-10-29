import { guessCountry } from '@/lib/countries'

// A starting suggestion for the account currency, from the visitor's country. They can change it.
const BY_COUNTRY: Record<string, string> = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', EG: 'EGP',
  TZ: 'TZS', UG: 'UGX', RW: 'RWF', ZM: 'ZMW', ET: 'ETB', MA: 'MAD', AE: 'AED', SA: 'SAR', IL: 'ILS', TR: 'TRY',
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', JP: 'JPY', CN: 'CNY', HK: 'HKD', SG: 'SGD', KR: 'KRW', TH: 'THB',
  VN: 'VND', MY: 'MYR', ID: 'IDR', PH: 'PHP', BR: 'BRL', MX: 'MXN', AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', UA: 'UAH', RU: 'RUB',
  ...Object.fromEntries(
    ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PT', 'IE', 'AT', 'FI', 'GR', 'LU', 'SK', 'SI', 'EE', 'LV', 'LT', 'HR', 'MT', 'CY']
      .map((c) => [c, 'EUR']),
  ),
}

export const guessCurrency = () => BY_COUNTRY[guessCountry()] ?? 'USD'
