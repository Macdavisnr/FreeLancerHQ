const TONES = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-sky-100 text-sky-700',
  red: 'bg-red-100 text-red-700',
} as const

interface Props {
  label: string
  value: string
  note: string
  tone: keyof typeof TONES
}

export default function StatCard({ label, value, note, tone }: Props) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <span className={`mb-4 block h-10 w-10 rounded-xl ${TONES[tone]}`} />
      <p className="text-muted">{label}</p>
      <p className="text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="text-sm text-muted">{note}</p>
    </div>
  )
}
