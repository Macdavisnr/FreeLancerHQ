interface Props {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  addLabel: string
}

const fieldClass = 'min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-brand-600'

/** An editable list of short text lines: add, change, remove. */
export default function StringListEditor({ label, items, onChange, placeholder, addLabel }: Props) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      {items.map((item, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <input
            aria-label={`${label} ${i + 1}`}
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className={fieldClass}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove ${label} ${i + 1}`}
            className="px-2 text-muted hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className="text-sm font-semibold text-brand-700">
        + {addLabel}
      </button>
    </div>
  )
}
