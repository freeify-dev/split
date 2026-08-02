import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { ActivityTab } from './pages/Activity'
import { BalancesTab } from './pages/Balances'
import { CreateGroup } from './pages/CreateGroup'
import { ExpenseFormPage } from './pages/ExpenseForm'
import { ExpensesTab } from './pages/Expenses'
import { GroupLayout } from './pages/GroupLayout'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { SettingsTab } from './pages/Settings'
import { SettleUpPage } from './pages/SettleUp'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
    },
  },
})

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/new', element: <CreateGroup /> },
  {
    path: '/g/:gid',
    element: <GroupLayout />,
    children: [
      { index: true, element: <Navigate to="expenses" replace /> },
      { path: 'expenses', element: <ExpensesTab /> },
      { path: 'expenses/new', element: <ExpenseFormPage /> },
      { path: 'expenses/:eid/edit', element: <ExpenseFormPage /> },
      { path: 'balances', element: <BalancesTab /> },
      { path: 'activity', element: <ActivityTab /> },
      { path: 'settings', element: <SettingsTab /> },
      { path: 'settle', element: <SettleUpPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
