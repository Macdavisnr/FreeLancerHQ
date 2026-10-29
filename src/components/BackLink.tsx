import { Link } from 'react-router-dom'

interface Props {
  to: string
  label: string
  className?: string
}

/** "← Label" link for returning to the previous screen. */
export default function BackLink({ to, label, className = '' }: Props) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label}
    </Link>
  )
}
