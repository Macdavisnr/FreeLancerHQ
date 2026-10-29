import { getExampleNumber, type CountryCode } from 'libphonenumber-js'
import examples from 'libphonenumber-js/examples.mobile.json'
import { COUNTRIES } from '@/lib/countries'

interface Props {
  label: string
  country: CountryCode
  national: string
  onChange: (country: CountryCode, national: string) => void
  id?: string
}

const fieldClass = 'rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600'

/** Country picker + local number. Works for every country; nothing is assumed. */
export default function PhoneField({ label, country, national, onChange, id = 'phone' }: Props) {
  const example = getExampleNumber(country, examples)?.formatNational()

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          aria-label="Country"
          value={country}
          onChange={(e) => onChange(e.target.value as CountryCode, national)}
          className={`${fieldClass} w-[42%] shrink-0 truncate px-3`}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} (+{c.dial})
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={example}
          value={national}
          onChange={(e) => onChange(country, e.target.value)}
          className={`${fieldClass} min-w-0 flex-1`}
        />
      </div>
    </div>
  )
}
