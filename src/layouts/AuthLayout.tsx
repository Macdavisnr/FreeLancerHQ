import { Navigate, Outlet } from 'react-router-dom'
import Logo from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'

const HIGHLIGHTS = [
  { label: 'Get paid faster', className: 'text-emerald-700' },
  { label: 'Track every project', className: 'text-amber-700' },
  { label: 'Know your profit', className: 'text-red-700' },
]

/** Split screen used by login and register: brand panel left, form right. */
export default function AuthLayout() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <Logo />
        <div>
          <h2 className="max-w-lg text-5xl font-extrabold leading-tight tracking-tight">
            Run your freelance business with confidence.
          </h2>
          <p className="mt-4 text-lg text-white/85">
            Clients, projects, invoices and payments in one friendly place.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {HIGHLIGHTS.map((h) => (
            <span
              key={h.label}
              className={`rounded-full bg-white px-4 py-2 text-sm font-semibold ${h.className}`}
            >
              {h.label}
            </span>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </section>
    </div>
  )
}
