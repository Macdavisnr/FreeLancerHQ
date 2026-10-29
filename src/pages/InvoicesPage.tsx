import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import InvoicesTable from '@/components/InvoicesTable'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import { btnPrimary } from '@/lib/ui'
import { listInvoices } from '@/services/invoiceService'
import type { Invoice, InvoiceSummary } from '@/types/invoice'
import { formatCurrency } from '@/utils/format'

const plural = (n: number) => `${n} invoice${n === 1 ? '' : 's'}`

export default function InvoicesPage() {
  const [data, setData] = useState<{ invoices: Invoice[]; summary: InvoiceSummary } | null>(null)

  useEffect(() => {
    listInvoices().then(setData)
  }, [])

  const summary = data?.summary

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Create, send and follow up on invoices."
        action={<Link to="/invoices/new" className={btnPrimary}>New invoice</Link>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid" value={formatCurrency(summary?.paidThisMonth ?? 0)} note="This month" tone="green" />
        <StatCard
          label="Outstanding"
          value={formatCurrency(summary?.outstanding ?? 0)}
          note={plural(summary?.outstandingCount ?? 0)}
          tone="amber"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(summary?.overdue ?? 0)}
          note={plural(summary?.overdueCount ?? 0)}
          tone="red"
        />
      </div>

      <InvoicesTable invoices={data?.invoices ?? null} emptyMessage="No invoices yet. Create your first one." />
    </>
  )
}
