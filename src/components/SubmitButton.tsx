import type { ReactNode } from 'react'
import Spinner from '@/components/Spinner'

interface Props {
  loading: boolean
  loadingText: string
  children: ReactNode
}

/** Full-width form submit button that shows a spinner and is disabled while the request runs. */
export default function SubmitButton({ loading, loadingText, children }: Props) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading && <Spinner />}
      {loading ? loadingText : children}
    </button>
  )
}
