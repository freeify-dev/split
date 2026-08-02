import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BalancesDto, ExpenseDto, ExpenseInput, GroupDto } from '@solomon/shared'
import { getClaim } from '../lib/device'
import { api, ApiClientError } from './client'

export const qk = {
  group: (gid: string) => ['group', gid] as const,
  expenses: (gid: string) => ['expenses', gid] as const,
  activity: (gid: string) => ['activity', gid] as const,
  homeBalances: (gid: string) => ['home-balances', gid] as const,
}

const dontRetry404 = (failureCount: number, error: unknown) =>
  !(error instanceof ApiClientError && error.status === 404) && failureCount < 2

export function useGroup(gid: string) {
  return useQuery({
    queryKey: qk.group(gid),
    queryFn: () => api<GroupDto>(`/api/groups/${gid}`),
    staleTime: 30_000,
    retry: dontRetry404,
  })
}

export function useExpenses(gid: string) {
  return useQuery({
    queryKey: qk.expenses(gid),
    queryFn: () => api<ExpenseDto[]>(`/api/groups/${gid}/expenses`),
    staleTime: 15_000,
    refetchInterval: 30_000, // v1 liveness: polling + refetch-on-focus instead of websockets
    retry: dontRetry404,
  })
}

/** Lightweight per-group balances for the Home page cards. */
export function useHomeBalances(gid: string) {
  return useQuery({
    queryKey: qk.homeBalances(gid),
    queryFn: () => api<BalancesDto>(`/api/groups/${gid}/balances`),
    staleTime: 60_000,
    retry: dontRetry404,
  })
}

export function useInvalidateGroup(gid: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: qk.group(gid) })
    void qc.invalidateQueries({ queryKey: qk.expenses(gid) })
    void qc.invalidateQueries({ queryKey: qk.activity(gid) })
    void qc.invalidateQueries({ queryKey: qk.homeBalances(gid) })
  }
}

export function useSaveExpense(gid: string, expenseId?: string) {
  const invalidate = useInvalidateGroup(gid)
  return useMutation({
    mutationFn: (input: ExpenseInput) =>
      expenseId
        ? api<ExpenseDto>(`/api/groups/${gid}/expenses/${expenseId}`, { method: 'PUT', json: input, actor: getClaim(gid) })
        : api<ExpenseDto>(`/api/groups/${gid}/expenses`, { method: 'POST', json: input, actor: getClaim(gid) }),
    onSuccess: invalidate,
  })
}

export function useDeleteExpense(gid: string) {
  const invalidate = useInvalidateGroup(gid)
  return useMutation({
    mutationFn: (expenseId: string) =>
      api<void>(`/api/groups/${gid}/expenses/${expenseId}`, { method: 'DELETE', actor: getClaim(gid) }),
    onSuccess: invalidate,
  })
}
