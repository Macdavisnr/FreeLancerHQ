/*
 * Reusable SQL fragments for money logic, so every query computes
 * "paid", "balance" and "status" in exactly the same way.
 * They all expect the invoices table to be aliased as `i`.
 */

/** Adds `pay.paid` = total payments received for each invoice. */
export const PAID_JOIN = `
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) pay
         ON pay.invoice_id = i.id`

/**
 * An invoice's status is DERIVED, never stored, so it can't go out of date:
 *   paid     -> payments cover the total
 *   draft    -> not sent yet
 *   overdue  -> sent, unpaid and past its due date
 *   sent     -> sent and still within its due date
 */
export const STATUS_SQL = `
  CASE
    WHEN i.total > 0 AND COALESCE(pay.paid, 0) >= i.total THEN 'paid'
    WHEN i.sent_at IS NULL THEN 'draft'
    WHEN i.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'sent'
  END`

export const toDate = (column: string, alias: string) => `to_char(${column}, 'YYYY-MM-DD') AS "${alias}"`

/** Money maths in whole kobo (cents) so 0.1 + 0.2 style float errors can't creep in. */
export const round2 = (n: number) => Math.round(n * 100) / 100
