import type { SplitMode } from './schemas'

export interface ParticipantDto {
  id: string
  name: string
}

export interface GroupDto {
  id: string
  name: string
  currency: string
  createdAt: number
  updatedAt: number
  participants: ParticipantDto[]
}

export type RateSource = 'same' | 'ecb' | 'fallback' | 'manual'

export interface ExpensePayerDto {
  participantId: string
  amount: number
}

export interface ExpenseSplitDto {
  participantId: string
  owedAmount: number
  splitInput: number | null
}

export interface ExpenseDto {
  id: string
  groupId: string
  description: string
  category: string
  currency: string
  amount: number
  date: string
  splitMode: SplitMode
  isReimbursement: boolean
  rateNanos: number
  rateSource: RateSource
  rateDate: string | null
  notes: string | null
  createdBy: string | null
  createdAt: number
  updatedAt: number
  payers: ExpensePayerDto[]
  splits: ExpenseSplitDto[]
}

export interface BalancesDto {
  currency: string
  balances: { participantId: string; net: number }[]
  transfers: { fromId: string; toId: string; amount: number }[]
}

export interface ActivityItemDto {
  id: number
  actorParticipantId: string | null
  entityType: 'group' | 'expense' | 'participant'
  entityId: string
  verb: 'create' | 'update' | 'delete'
  summary: string
  createdAt: number
}

export interface ActivityPageDto {
  items: ActivityItemDto[]
  nextBefore: number | null
}

export interface RateDto {
  rateNanos: number
  rateDate: string | null
  source: RateSource
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
