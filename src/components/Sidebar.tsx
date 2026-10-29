import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import Logo from '@/components/Logo'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clients', label: 'Clients' },
  { to: '/projects', label: 'Projects' },
  { to: '/proposals', label: 'Proposals' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/payments', label: 'Payments' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/documents', label: 'Documents' },
  { to: '/reports', label: 'Reports' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-xl px-4 py-2.5 text-[15px] font-medium transition-colors ${
    isActive ? 'bg-sidebar-active text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
  }`

interface Props {
  /** Only matters below the md breakpoint, where the sidebar is a slide-in drawer. */
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: Props) {
  // Close the drawer with the Escape key.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Dark backdrop behind the drawer (mobile only) */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`print:hidden fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-sidebar px-4 py-6 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Logo className="mb-8 px-2" />
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={onClose}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/settings" className={(state) => `${linkClass(state)} mt-auto`} onClick={onClose}>
          Settings
        </NavLink>
      </aside>
    </>
  )
}
