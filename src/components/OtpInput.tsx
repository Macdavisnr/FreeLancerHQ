import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  /** Called once all digits are filled in, so the form can submit by itself. */
  onComplete?: (value: string) => void
  length?: number
  disabled?: boolean
  hasError?: boolean
}

/** A row of single-digit boxes: auto-advances, handles Backspace, and accepts a pasted code. */
export default function OtpInput({ value, onChange, onComplete, length = 6, disabled, hasError }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  function update(next: string) {
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }

  function handleChange(index: number, raw: string) {
    const typed = raw.replace(/\D/g, '')
    if (!typed) return
    // Typing (or autofill) can deliver several digits at once: spread them across the boxes.
    const next = (value.slice(0, index) + typed).slice(0, length)
    update(next)
    refs.current[Math.min(next.length, length - 1)]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) {
        update(value.slice(0, index) + value.slice(index + 1))
      } else if (index > 0) {
        update(value.slice(0, index - 1) + value.slice(index))
        refs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    update(pasted)
    refs.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          autoFocus={i === 0}
          aria-label={`Digit ${i + 1}`}
          className={`h-14 w-full min-w-0 rounded-xl border bg-white text-center text-2xl font-bold outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 ${
            hasError ? 'border-red-400' : 'border-line'
          }`}
        />
      ))}
    </div>
  )
}
