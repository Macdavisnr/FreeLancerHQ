import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import InvoiceDocument from '@/components/InvoiceDocument'
import InvoiceStatusBadge from '@/components/InvoiceStatusBadge'
import Logo from '@/components/Logo'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { getPublicInvoice, startOnlinePayment, verifyOnlinePayment } from '@/services/invoiceService'
import { describeDeadline, formatCurrency, formatDate } from '@/utils/format'

type Data = Awaited<ReturnType<typeof getPublicInvoice>>
type PaymentOutcome = Awaited<ReturnType<typeof verifyOnlinePayment>>

const OUTCOME_MESSAGES: Record<PaymentOutcome, { text: string; tone: string }> = {
  paid: { text: '✓ Payment received. Thank you!', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  pending: { text: 'We have not received confirmation from Paystack yet. If you completed the payment, refresh this page in a minute.', tone: 'border-amber-300 bg-amber-50 text-amber-900' },
  failed: { text: 'The payment did not go through, and you have not been charged. You can try again.', tone: 'border-red-200 bg-red-50 text-red-700' },
  unknown: { text: 'We could not find that payment. If money left your account, contact the sender.', tone: 'border-red-200 bg-red-50 text-red-700' },
  mismatch: { text: 'Something did not match on this payment. Please contact the sender before paying again.', tone: 'border-red-200 bg-red-50 text-red-700' },
}

/*
 * What the CLIENT sees when they open the link in their email. No login, no sidebar: just the
 * invoice. Everything comes from GET /api/public/invoices/:token, which only returns what is
 * safe for a stranger to see.
 */
export default function PublicInvoicePage() {
  const { token } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  // Paystack sends the client back to this page with ?reference=... added.
  const [returningRef] = useState(() => searchParams.get('reference'))
  const [data, setData] = useState<Data | undefined>(undefined)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!token) return
    // Back from Paystack? Confirm the payment with OUR server first, so the invoice we then load
    // already shows it. Then tidy the address bar so a refresh doesn't verify again.
    const confirm = returningRef
      ? verifyOnlinePayment(token, returningRef)
          .then(setOutcome)
          .catch(() => setOutcome('pending'))
          .finally(() => setSearchParams({}, { replace: true }))
      : Promise.resolve()
    confirm
      .then(() => getPublicInvoice(token))
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the invoice.'))
  }, [token, returningRef, setSearchParams])

  async function handlePay() {
    if (!token) return
    setError('')
    setPaying(true)
    try {
      // Leave our site for Paystack's secure checkout page. Card details never touch our server.
      window.location.href = await startOnlinePayment(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment.')
      setPaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 sm:py-12 print:bg-white print:p-0">
      {/* React 19 moves these into <head>. noindex keeps invoice links out of search engines. */}
      <meta name="robots" content="noindex" />
      <title>{data ? `Invoice ${data.invoice.reference} from ${data.business.name}` : 'Invoice'}</title>

      <div className="mx-auto max-w-3xl">
        {error && !data && <p className="rounded-2xl border border-line bg-white p-8 text-center text-red-600">{error}</p>}
        {!error && data === undefined && (
          <p className="text-center text-muted">{returningRef ? 'Confirming your payment with Paystack…' : 'Loading invoice…'}</p>
        )}
        {data === null && (
          <div className="rounded-2xl border border-line bg-white p-10 text-center">
            <h1 className="mb-2 text-2xl font-extrabold">Invoice not found</h1>
            <p className="text-muted">This link is not valid. Please check it, or ask the sender for a new one.</p>
          </div>
        )}

        {data && (() => {
          const { invoice, items, business } = data
          const paid = invoice.status === 'paid'
          return (
            <>
              <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted">Invoice from {business.name}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <h1 className="text-3xl font-extrabold tracking-tight">{invoice.reference}</h1>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                </div>
                <button onClick={() => window.print()} className={`${btnSecondary} print:hidden`}>Download PDF</button>
              </header>

              {outcome && !(outcome === 'paid' && paid) && (
                <p role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold print:hidden ${OUTCOME_MESSAGES[outcome].tone}`}>
                  {OUTCOME_MESSAGES[outcome].text}
                </p>
              )}

              {/* The headline: how much, by when, and the Pay button. */}
              <section className={`mb-4 rounded-2xl border p-6 shadow-sm ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-white'}`}>
                {paid ? (
                  <p className="text-lg font-bold text-emerald-800">
                    ✓ {outcome === 'paid' ? 'Payment received. ' : ''}Paid in full. Thank you!
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-sm text-muted">Amount due</p>
                        <p className="text-4xl font-extrabold tracking-tight">{formatCurrency(invoice.balance, invoice.currency)}</p>
                      </div>
                      <p className={`font-semibold ${invoice.status === 'overdue' ? 'text-red-600' : 'text-muted'}`}>
                        Due {formatDate(invoice.dueDate)} · {describeDeadline(invoice.dueDate)}
                      </p>
                    </div>
                    {data.payOnline && (
                      <div className="mt-5 border-t border-line pt-5 print:hidden">
                        <button onClick={handlePay} disabled={paying} className={`${btnPrimary} w-full py-4 text-lg sm:w-auto sm:px-10`}>
                          {paying ? 'Opening secure checkout…' : `Pay ${formatCurrency(invoice.balance, invoice.currency)}`}
                        </button>
                        <p className="mt-2 text-sm text-muted">Card, bank transfer or USSD · Secured by Paystack</p>
                        {data.paymentMode === 'test' && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <span className="font-bold">Test mode:</span> no real money is charged. Use a Paystack test card.
                          </p>
                        )}
                        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
                      </div>
                    )}
                  </>
                )}
              </section>

              <div className="space-y-4">
                <InvoiceDocument
                  business={business}
                  client={{ name: invoice.clientName, email: invoice.clientEmail, company: invoice.clientCompany, address: invoice.clientAddress }}
                  invoice={invoice}
                  items={items}
                />
              </div>

              <p className="mt-8 text-center text-sm text-muted print:hidden">
                Questions about this invoice? Reply to the email, or contact {business.email}.
              </p>
              <div className="mt-6 flex justify-center opacity-70 print:hidden">
                <Logo className="!text-ink text-base" />
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
