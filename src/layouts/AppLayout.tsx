import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { CurrencyContext } from '@/lib/currency-context'
import { getSettings } from '@/services/settingsService'
import { setActiveCurrency } from '@/utils/format'

/** The signed-in shell: sidebar on the left, topbar + page content on the right. */
export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Load the user's currency before any page shows money, so amounts never flash in the wrong one.
  const [currency, setCurrency] = useState<string | null>(null)
  useEffect(() => {
    getSettings()
      .then((r) => r.settings.currency)
      .catch(() => 'USD')
      .then((code) => {
        setActiveCurrency(code)
        setCurrency(code)
      })
  }, [])

  const value = useMemo(
    () =>
      currency
        ? {
            currency,
            changeCurrency: (code: string) => {
              setActiveCurrency(code)
              setCurrency(code)
            },
          }
        : null,
    [currency],
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="min-w-0 flex-1">
        <Topbar onMenuClick={() => setMenuOpen(true)} />
        <main className="px-6 py-6 md:px-8">
          {value ? (
            <CurrencyContext.Provider value={value}>
              {/* key: when the currency changes, pages remount so every amount is re-formatted */}
              <Outlet key={value.currency} />
            </CurrencyContext.Provider>
          ) : (
            <p className="text-muted">Loading…</p>
          )}
        </main>
      </div>
    </div>
  )
}
