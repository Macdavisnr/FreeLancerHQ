import { RouterProvider } from 'react-router-dom'
import AuthProvider from '@/components/AuthProvider'
import { router } from '@/routes'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
