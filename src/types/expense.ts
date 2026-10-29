export interface Expense {
  id: string
  description: string
  category: string
  amount: number
  spentOn: string
}

export type ExpenseInput = Omit<Expense, 'id'>

export interface ExpenseSummary {
  monthTotal: number
  monthCount: number
  largestCategory: { name: string; amount: number } | null
}
