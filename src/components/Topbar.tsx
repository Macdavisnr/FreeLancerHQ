import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth()

  return (
    <header className="print:hidden flex items-center justify-between gap-3 px-6 pt-4 md:px-8">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white md:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <input
        type="search"
        placeholder="Search"
        className="w-full max-w-md rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-600"
      />
      <Link
        to="/profile"
        aria-label="Profile"
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sun font-bold"
      >
        {user?.name.charAt(0).toUpperCase()}
      </Link>
    </header>
  )
}
