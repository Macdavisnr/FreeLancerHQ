import { Link } from 'react-router-dom'
import Logo from '@/components/Logo'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-brand-600 text-white">
      <header className="flex items-center justify-between px-6 py-6 md:px-12">
        <Logo />
        <nav className="flex items-center gap-3">
          <Link to="/login" className="px-4 py-2 font-semibold text-white/90 hover:text-white">
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-xl bg-white px-5 py-2.5 font-semibold text-brand-700"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-3xl text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
          Run your freelance business with confidence.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/85">
          Clients, projects, invoices and payments in one friendly place.
        </p>
        <Link
          to="/register"
          className="mt-8 rounded-xl bg-sun px-8 py-3.5 text-lg font-bold text-ink"
        >
          Create your free account
        </Link>
      </main>
    </div>
  )
}
