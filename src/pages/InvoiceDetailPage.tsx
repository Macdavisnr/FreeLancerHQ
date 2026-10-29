import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackLink from '@/components/BackLink'
import InvoiceDocument from '@/components/InvoiceDocument'
import InvoiceStatusBadge from '@/components/InvoiceStatusBadge'
import { btnDanger, btnPrimary, btnSecondary } from '@/lib/ui'
import {
  deleteInvoice,
  deletePayment,
  getInvoice,
  publicInvoiceUrl,
  recordPayment,
  sendInvoice,
  type Delivery,
  type InvoiceDetail,
} from '@/services/invoiceService'
import { getRate } from '@/services/ratesService'
import { currencySymbol, describeDeadline, formatCurrency, formatDate, getActiveCurrency, todayISO } from '@/utils/format'

const fieldClass = 'w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-brand-600'

function Row({ label, children, bold }: { label: string; children: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 ${bold ? 'font-extrabold' : 'text-muted'}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  )
}

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState<InvoiceDetail | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payment, setPayment] = useState({ amount: '', paidOn: todayISO(), method: 'Bank transfer', note: '' })
  // For invoices in another currency: today's market rate, and what the person says they received.
  const [rate, setRate] = useState<'loading' | 'failed' | { value: number; stale: boolean; attribution: string } | null>(null)
  const [receivedInput, setReceivedInput] = useState<string | null>(null) // null = use the suggestion
  // The "Send invoice" panel: null = closed
  const [sending, setSending] = useState<{ to: string; message: string } | null>(null)
  const [sentNotice, setSentNotice] = useState<{ delivery: Delivery; to: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (id) getInvoice(id).then(setData)
  }, [id])

  if (data === undefined) return <p className="text-muted">Loading…</p>
  if (data === null) {
    return (
      <>
        <p className="mb-4 text-muted">Invoice not found.</p>
        <Link to="/invoices" className={btnSecondary}>Back to invoices</Link>
      </>
    )
  }

  const { invoice, items, payments, business } = data
  const number = invoice.reference
  const canPay = invoice.sentAt !== null && invoice.balance > 0

  // Every amount on this page is shown in the invoice's own currency.
  const home = getActiveCurrency()
  const foreign = invoice.currency !== home
  const money = (amount: number) => formatCurrency(amount, invoice.currency)
  const homeMoney = (amount: number) => formatCurrency(amount, home)
  const fmtRate = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })

  // What the payment is worth at today's rate, offered as the default for "You received".
  const suggested = typeof rate === 'object' && rate ? Math.round(Number(payment.amount || 0) * rate.value * 100) / 100 : null
  const received = receivedInput ?? (suggested ? String(suggested) : '')

  /** Run an action, show any error, and keep the screen in sync with what the server returns. */
  async function run(action: () => Promise<InvoiceDetail | void>) {
    setError('')
    setBusy(true)
    try {
      const result = await action()
      if (result) setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function openPaymentForm() {
    setPayment((p) => ({ ...p, amount: String(invoice.balance), paidOn: todayISO() }))
    setReceivedInput(null)
    setPaying(true)
    if (foreign) {
      setRate('loading')
      getRate(invoice.currency, home)
        .then((r) => setRate({ value: r.rate, stale: r.stale, attribution: r.attribution }))
        .catch(() => setRate('failed'))
    }
  }

  async function handlePayment(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      const result = await recordPayment(invoice.id, {
        amount: Number(payment.amount),
        baseAmount: foreign && Number(received) > 0 ? Number(received) : undefined,
        paidOn: payment.paidOn,
        method: payment.method,
        note: payment.note,
      })
      setPaying(false)
      return result
    })
  }

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm('Remove this payment?')) return
    await run(async () => {
      await deletePayment(paymentId)
      return getInvoice(invoice.id).then((d) => d ?? undefined)
    })
  }

  function openSendPanel() {
    setSentNotice(null)
    setSending({
      to: invoice.clientEmail,
      message: `Hi ${invoice.clientName},\n\nPlease find invoice ${number} below. You can view the full invoice using the link in this email.\n\nThank you,\n${business.name}`,
    })
  }

  /** email = false: just mark it as sent (you shared it some other way). */
  async function handleSend(email: boolean) {
    if (!sending) return
    const to = sending.to
    await run(async () => {
      const result = await sendInvoice(invoice.id, { email, to, message: sending.message })
      setSending(null)
      if (email) setSentNotice({ delivery: result.delivery, to })
      return result
    })
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete() {
    if (!window.confirm(`Delete draft ${number}? This cannot be undone.`)) return
    await run(async () => {
      await deleteInvoice(invoice.id)
      navigate('/invoices', { replace: true })
    })
  }

  // Activity feed built from what we already know: created, sent, each payment.
  const activity = [
    { label: 'Invoice created', date: invoice.createdAt.slice(0, 10), dot: 'bg-brand-600' },
    ...(invoice.sentAt ? [{ label: 'Marked as sent', date: invoice.sentAt.slice(0, 10), dot: 'bg-sky-500' }] : []),
    ...(invoice.lastEmailedAt ? [{ label: 'Emailed to client', date: invoice.lastEmailedAt.slice(0, 10), dot: 'bg-sky-500' }] : []),
    ...(invoice.viewedAt ? [{ label: 'Viewed by client', date: invoice.viewedAt.slice(0, 10), dot: 'bg-violet-500' }] : []),
    ...payments.map((p) => ({ label: `Payment of ${money(p.amount)}`, date: p.paidOn, dot: 'bg-emerald-500' })),
  ]

  return (
    <>
      <div className="print:hidden">
        <BackLink to="/invoices" label="Invoices" className="mb-2" />
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">{number}</h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-muted">
            {invoice.clientName}{invoice.projectName ? `, ${invoice.projectName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          <button onClick={() => window.print()} className={btnSecondary}>Download PDF</button>
          <Link to={`/invoices/${invoice.id}/edit`} className={btnSecondary}>Edit</Link>
          {invoice.status === 'draft' && (
            <>
              <button disabled={busy} onClick={handleDelete} className={btnDanger}>Delete</button>
              {!sending && <button disabled={busy} onClick={openSendPanel} className={btnPrimary}>Send invoice</button>}
            </>
          )}
          {canPay && !paying && <button onClick={openPaymentForm} className={btnPrimary}>Record payment</button>}
        </div>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {sentNotice && (
        <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm print:hidden ${
          sentNotice.delivery === 'console' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {sentNotice.delivery === 'console' ? (
            <>
              <span className="font-bold">Development mode:</span> no email provider is configured, so the email to{' '}
              {sentNotice.to} was printed in the API terminal instead of being sent. The client link below works.
            </>
          ) : (
            <>✓ Invoice emailed to {sentNotice.to}.</>
          )}
        </div>
      )}

      {sending && (
        <section className="mb-4 rounded-2xl border border-brand-600 bg-white p-6 shadow-sm print:hidden">
          <h2 className="mb-1 font-bold">{invoice.sentAt ? 'Email this invoice again' : 'Send invoice'}</h2>
          <p className="mb-4 text-sm text-muted">
            The client gets this message and a link to view the invoice online. Replies come to {business.email}.
          </p>
          <label htmlFor="send-to" className="mb-1 block text-sm font-semibold">To</label>
          <input id="send-to" type="email" required value={sending.to}
            onChange={(e) => setSending({ ...sending, to: e.target.value })} className={`${fieldClass} mb-3`} />
          <label htmlFor="send-message" className="mb-1 block text-sm font-semibold">Message</label>
          <textarea id="send-message" rows={6} value={sending.message}
            onChange={(e) => setSending({ ...sending, message: e.target.value })} className={`${fieldClass} mb-4`} />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !sending.to} onClick={() => handleSend(true)} className={btnPrimary}>
              {busy ? 'Sending…' : 'Send email'}
            </button>
            {!invoice.sentAt && (
              <button disabled={busy} onClick={() => handleSend(false)} className={btnSecondary} title="You shared it another way, e.g. WhatsApp">
                Mark as sent without emailing
              </button>
            )}
            <button onClick={() => setSending(null)} className={btnSecondary}>Cancel</button>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <InvoiceDocument
            business={business}
            client={{ name: invoice.clientName, email: invoice.clientEmail }}
            invoice={invoice}
            items={items}
          />
        </div>

        <div className="space-y-4 print:hidden">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-bold">Summary</h2>
            <Row label="Status"><span className="font-bold text-ink capitalize">{invoice.status}</span></Row>
            <Row label="Amount"><span className="font-bold text-ink">{money(invoice.total)}</span></Row>
            <Row label="Balance due"><span className="font-bold text-ink">{money(invoice.balance)}</span></Row>
            {foreign && (
              <>
                <Row label={`Amount in ${home}`}><span className="font-bold text-ink">≈ {homeMoney(invoice.totalBase)}</span></Row>
                <p className="pb-1.5 text-right text-xs text-muted">
                  {invoice.sentAt ? 'Rate saved when sent' : 'Today’s rate; saved when sent'}: 1 {invoice.currency} = {fmtRate(invoice.baseRate)} {home}
                </p>
              </>
            )}
            {invoice.status !== 'paid' && <Row label="Due"><span className="font-bold text-ink">{describeDeadline(invoice.dueDate)}</span></Row>}
            {invoice.projectName && (
              <Row label="Project">
                <Link to={`/projects/${invoice.projectId}`} className="font-bold text-brand-700">{invoice.projectName}</Link>
              </Row>
            )}
            <Row label="Client">
              <Link to={`/clients/${invoice.clientId}`} className="font-bold text-brand-700">{invoice.clientName}</Link>
            </Row>
          </section>

          {invoice.publicToken && (
            <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="mb-1 font-bold">Client link</h2>
              <p className="mb-3 text-sm text-muted">Anyone with this link can view this invoice, so only share it with your client.</p>
              <input readOnly value={publicInvoiceUrl(invoice.publicToken)} onFocus={(e) => e.target.select()}
                aria-label="Client link" className={`${fieldClass} mb-3 text-sm`} />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => copyLink(publicInvoiceUrl(invoice.publicToken!))} className={`${btnSecondary} px-4 py-2`}>
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <a href={publicInvoiceUrl(invoice.publicToken)} target="_blank" rel="noreferrer" className={`${btnSecondary} px-4 py-2`}>Open</a>
                {invoice.status !== 'paid' && !sending && (
                  <button onClick={openSendPanel} className={`${btnSecondary} px-4 py-2`}>Email again</button>
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-bold">Payments</h2>
            {payments.length === 0 && !paying && (
              <p className="mb-3 text-muted">
                {invoice.sentAt
                  ? `No payments yet. Record a payment when ${invoice.clientName} pays.`
                  : 'Mark the invoice as sent before recording payments.'}
              </p>
            )}
            <ul>
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
                  <div>
                    <p className="font-semibold">{money(p.amount)}</p>
                    {foreign && (
                      <p className="text-sm font-semibold text-emerald-700">
                        → {homeMoney(p.baseAmount)} received <span className="font-normal text-muted">(1 {invoice.currency} = {fmtRate(p.exchangeRate)} {home})</span>
                      </p>
                    )}
                    <p className="text-sm text-muted">{formatDate(p.paidOn)}{p.method ? ` · ${p.method}` : ''}</p>
                  </div>
                  <button
                    onClick={() => handleDeletePayment(p.id)}
                    aria-label="Remove payment"
                    className="px-2 text-muted hover:text-red-600"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            {paying ? (
              <form onSubmit={handlePayment} className="mt-3 space-y-3 border-t border-line pt-4">
                <div>
                  <label htmlFor="pay-amount" className="mb-1 block text-sm font-semibold">Amount paid ({currencySymbol(invoice.currency)})</label>
                  <input id="pay-amount" type="number" min="0" step="any" required value={payment.amount}
                    onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} className={fieldClass} />
                </div>
                {foreign && (
                  <div className="rounded-xl bg-brand-50 p-3">
                    <label htmlFor="pay-received" className="mb-1 block text-sm font-semibold">
                      You received ({currencySymbol(home)})
                    </label>
                    <input
                      id="pay-received" type="number" min="0" step="any" value={received} placeholder={rate === 'loading' ? 'Fetching rate…' : ''}
                      onChange={(e) => setReceivedInput(e.target.value)} className={fieldClass}
                    />
                    <p className="mt-1.5 text-xs text-brand-700">
                      {rate === 'loading' && 'Fetching today’s exchange rate…'}
                      {rate === 'failed' && 'Exchange rates are unavailable. Enter the amount you received in your account currency.'}
                      {typeof rate === 'object' && rate && (
                        <>
                          Converted automatically at today’s rate (1 {invoice.currency} = {fmtRate(rate.value)} {home}).
                          Change it to the exact amount your bank or payment provider paid you, since their rate and fees can differ.
                          {rate.stale && ' Rates could not be refreshed; this is the last known rate.'}{' '}
                          <a href={rate.attribution} target="_blank" rel="noreferrer" className="underline">Rates by ExchangeRate-API</a>
                        </>
                      )}
                    </p>
                  </div>
                )}
                <div>
                  <label htmlFor="pay-date" className="mb-1 block text-sm font-semibold">Date received</label>
                  <input id="pay-date" type="date" required value={payment.paidOn}
                    onChange={(e) => setPayment((p) => ({ ...p, paidOn: e.target.value }))} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="pay-method" className="mb-1 block text-sm font-semibold">Method</label>
                  <select id="pay-method" value={payment.method}
                    onChange={(e) => setPayment((p) => ({ ...p, method: e.target.value }))} className={fieldClass}>
                    {['Bank transfer', 'Cash', 'Card', 'Other'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className={btnPrimary}>Save payment</button>
                  <button type="button" onClick={() => setPaying(false)} className={btnSecondary}>Cancel</button>
                </div>
              </form>
            ) : (
              canPay && <button onClick={openPaymentForm} className={`${btnSecondary} w-full`}>Record payment</button>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-bold">Activity</h2>
            <ul className="space-y-3">
              {activity.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.dot}`} />
                  <div>
                    <p className="font-semibold">{a.label}</p>
                    <p className="text-sm text-muted">{formatDate(a.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
