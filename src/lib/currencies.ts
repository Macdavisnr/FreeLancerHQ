const names = new Intl.DisplayNames([navigator.language, 'en'], { type: 'currency' })

/** Every ISO 4217 currency the browser knows, sorted by name: "Euro (EUR)", "US Dollar (USD)"... */
export const CURRENCY_OPTIONS = Intl.supportedValuesOf('currency')
  .map((code) => ({ code, label: `${names.of(code) ?? code} (${code})` }))
  .sort((a, b) => a.label.localeCompare(b.label))
