/** Shared Tailwind class strings for buttons, so every button looks the same. */
const base = 'inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold transition-colors disabled:opacity-60'

export const btnPrimary = `${base} bg-brand-600 text-white hover:bg-brand-700`
export const btnSecondary = `${base} border border-line bg-white text-ink hover:bg-canvas`
export const btnDanger = `${base} border border-red-200 bg-white text-red-700 hover:bg-red-50`
