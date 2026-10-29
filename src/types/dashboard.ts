export interface Dashboard {
  revenueThisMonth: number
  revenueLastMonth: number
  outstanding: number
  outstandingCount: number
  activeProjects: number
  projectsDueThisWeek: number
  expensesThisMonth: number
  /** Last 6 months, oldest first. month is the first day of the month: 'YYYY-MM-01' */
  revenueByMonth: { month: string; amount: number }[]
  /** time is 'HH:MM' for timed events, otherwise null */
  upcoming: { kind: 'event' | 'task' | 'project' | 'invoice'; label: string; date: string; time: string | null }[]
}
