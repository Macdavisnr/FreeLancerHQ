import { api, ApiError } from '@/lib/api'
import type { Expense, ExpenseInput, ExpenseSummary } from '@/types/expense'

export const listExpenses = () =>
  api<{ expenses: Expense[]; summary: ExpenseSummary }>('/expenses')

export async function getExpense(id: string): Promise<Expense | null> {
  try {
    const { expense } = await api<{ expense: Expense }>(`/expenses/${id}`)
    return expense
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const { expense } = await api<{ expense: Expense }>('/expenses', { method: 'POST', body: input })
  return expense
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  const { expense } = await api<{ expense: Expense }>(`/expenses/${id}`, { method: 'PUT', body: input })
  return expense
}

export const deleteExpense = (id: string) => api<void>(`/expenses/${id}`, { method: 'DELETE' })
