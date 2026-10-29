interface Props<K extends string> {
  steps: { key: K; label: string }[]
  current: K
}

/** "Step 2 of 3" progress bar used by the multi-step auth flows (sign-up, forgot password). */
export default function StepIndicator<K extends string>({ steps, current }: Props<K>) {
  const index = steps.findIndex((s) => s.key === current)
  return (
    <div className="mb-6" aria-label={`Step ${index + 1} of ${steps.length}`}>
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-brand-600' : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold text-muted">
        Step {index + 1} of {steps.length}: {steps[index].label}
      </p>
    </div>
  )
}
