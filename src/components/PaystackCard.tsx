import { useEffect, useState, type FormEvent } from 'react'
import TextField from '@/components/TextField'
import { btnDanger, btnPrimary, btnSecondary } from '@/lib/ui'
import { connectPaystack, disconnectPaystack, getPaystack } from '@/services/settingsService'
import type { PaystackConnection } from '@/types/settings'

/** Settings → Online payments: connect the freelancer's OWN Paystack account. */
export default function PaystackCard() {
  const [connection, setConnection] = useState<PaystackConnection | null>(null)
  const [secretKey, setSecretKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getPaystack().then(setConnection).catch(() => setError('Could not load your payment settings.'))
  }, [])

  async function handleConnect(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      setConnection(await connectPaystack(secretKey))
      setSecretKey('') // don't keep the key in the page any longer than needed
      setReplacing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Paystack.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Paystack? Clients will no longer see a Pay button on your invoices.')) return
    setBusy(true)
    try {
      await disconnectPaystack()
      setConnection((c) => c && { ...c, connected: false, mode: null, last4: null, connectedAt: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.')
    } finally {
      setBusy(false)
    }
  }

  async function copyWebhook() {
    if (!connection) return
    await navigator.clipboard.writeText(connection.webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="max-w-5xl rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h2 className="font-bold">Online payments</h2>
      <p className="mb-4 text-muted">
        Connect your own Paystack account and clients can pay invoices online by card, bank transfer or USSD. Money goes
        straight to your Paystack account and invoices are marked paid automatically.
      </p>

      {connection === null && !error && <p className="text-muted">Loading…</p>}

      {connection?.connected && !replacing && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">✓ Paystack connected</span>
            {connection.mode === 'test' ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">Test mode: no real money moves</span>
            ) : (
              <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">Live</span>
            )}
            <span className="font-mono text-sm text-muted">sk_{connection.mode}_…{connection.last4}</span>
          </div>

          <div className="mb-4 rounded-xl bg-canvas p-4">
            <p className="mb-1 text-sm font-semibold">Recommended: set your webhook URL in Paystack</p>
            <p className="mb-3 text-sm text-muted">
              In Paystack go to Settings → API Keys &amp; Webhooks and paste this as the {connection.mode === 'test' ? 'Test' : 'Live'}{' '}
              Webhook URL. It lets payments be confirmed even if the client closes the page before returning.
              {connection.webhookUrl.includes('localhost') && ' (Paystack cannot reach localhost, so this only works once the app is deployed.)'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={connection.webhookUrl} onFocus={(e) => e.target.select()} aria-label="Webhook URL"
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm" />
              <button type="button" onClick={copyWebhook} className={`${btnSecondary} px-4 py-2`}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setReplacing(true)} className={btnSecondary}>Change key</button>
            <button type="button" onClick={handleDisconnect} disabled={busy} className={btnDanger}>Disconnect</button>
          </div>
        </>
      )}

      {connection && (!connection.connected || replacing) && (
        <form onSubmit={handleConnect} className="max-w-xl">
          <TextField
            label="Paystack secret key"
            id="paystack-key"
            type="password"
            autoComplete="off"
            placeholder="sk_test_…"
            value={secretKey}
            onChange={(e) => {
              setSecretKey(e.target.value)
              setError('')
            }}
            required
          />
          <p className="-mt-2 mb-4 text-sm text-muted">
            Find it in your Paystack dashboard under Settings → API Keys &amp; Webhooks. Use the <strong>test</strong> key
            (sk_test_…) while you try things out. It is checked with Paystack, then stored encrypted. Never share it with anyone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !secretKey} className={btnPrimary}>{busy ? 'Checking with Paystack…' : 'Connect Paystack'}</button>
            {replacing && <button type="button" onClick={() => setReplacing(false)} className={btnSecondary}>Cancel</button>}
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  )
}
