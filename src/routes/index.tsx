import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import CalendarPage from '@/pages/CalendarPage'
import ClientDetailPage from '@/pages/ClientDetailPage'
import ClientFormPage from '@/pages/ClientFormPage'
import ClientsPage from '@/pages/ClientsPage'
import DashboardPage from '@/pages/DashboardPage'
import DocumentsPage from '@/pages/DocumentsPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ExpenseFormPage from '@/pages/ExpenseFormPage'
import ExpensesPage from '@/pages/ExpensesPage'
import InvoiceDetailPage from '@/pages/InvoiceDetailPage'
import InvoiceFormPage from '@/pages/InvoiceFormPage'
import InvoicesPage from '@/pages/InvoicesPage'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import ProposalDetailPage from '@/pages/ProposalDetailPage'
import ProposalFormPage from '@/pages/ProposalFormPage'
import ProposalsPage from '@/pages/ProposalsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import ProjectFormPage from '@/pages/ProjectFormPage'
import ProjectsPage from '@/pages/ProjectsPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import TasksPage from '@/pages/TasksPage'
import PaymentsPage from '@/pages/PaymentsPage'

export const router = createBrowserRouter([
  // Public
  { path: '/', element: <LandingPage /> },
  // The client's view of a sent invoice: public, no login (the link itself is the permission).
  { path: '/i/:token', lazy: async () => ({ Component: (await import('@/pages/PublicInvoicePage')).default }) },
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      // Loaded on demand: these two pages pull in the phone-number library (country data is large).
      { path: '/register', lazy: async () => ({ Component: (await import('@/pages/RegisterPage')).default }) },
      {
        path: '/forgot-password',
        element: <ForgotPasswordPage />,
      },
    ],
  },

  // Private: ProtectedRoute checks login, AppLayout draws the sidebar + topbar
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/profile', lazy: async () => ({ Component: (await import('@/pages/ProfilePage')).default }) },
          { path: '/clients', element: <ClientsPage /> },
          { path: '/clients/new', element: <ClientFormPage /> },
          { path: '/clients/:id', element: <ClientDetailPage /> },
          { path: '/clients/:id/edit', element: <ClientFormPage /> },
          { path: '/proposals', element: <ProposalsPage /> },
          { path: '/proposals/new', element: <ProposalFormPage /> },
          { path: '/proposals/:id', element: <ProposalDetailPage /> },
          { path: '/proposals/:id/edit', element: <ProposalFormPage /> },
          { path: '/projects', element: <ProjectsPage /> },
          { path: '/projects/new', element: <ProjectFormPage /> },
          { path: '/projects/:id', element: <ProjectDetailPage /> },
          { path: '/projects/:id/edit', element: <ProjectFormPage /> },
          { path: '/invoices', element: <InvoicesPage /> },
          { path: '/invoices/new', element: <InvoiceFormPage /> },
          { path: '/invoices/:id', element: <InvoiceDetailPage /> },
          { path: '/invoices/:id/edit', element: <InvoiceFormPage /> },
          { path: '/payments', element: <PaymentsPage /> },
          { path: '/expenses', element: <ExpensesPage /> },
          { path: '/expenses/new', element: <ExpenseFormPage /> },
          { path: '/expenses/:id/edit', element: <ExpenseFormPage /> },
          { path: '/tasks', element: <TasksPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/documents', element: <DocumentsPage /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
])
