export interface ReportMonth {
  /** First day of the month: 'YYYY-MM-01' */
  month: string
  revenue: number
  expenses: number
  profit: number
}

export interface Report {
  revenueThisMonth: number
  revenueLastMonth: number
  expensesThisMonth: number
  profitThisMonth: number
  outstanding: number
  outstandingCount: number
  /** Last 6 months, oldest first */
  months: ReportMonth[]
}
