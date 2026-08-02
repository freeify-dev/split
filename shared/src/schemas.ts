import { z } from 'zod'
import { isCategorySlug } from './categories'
import { isCurrencyCode } from './currencies'
import { MAX_MINOR_AMOUNT, MAX_RATE_NANOS } from './money'

export const SPLIT_MODES = ['equal', 'exact', 'percentage', 'shares'] as const
export type SplitMode = (typeof SPLIT_MODES)[number]

export const MAX_SHARE_WEIGHT = 1_000_000

const currencyCode = z.string().refine(isCurrencyCode, 'Unknown currency')
const categorySlug = z.string().refine(isCategorySlug, 'Unknown category')
const idString = z.string().min(1).max(40)

export function isValidDateString(s: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1) return false
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]!
}

const dateString = z.string().refine(isValidDateString, 'Invalid date (expected YYYY-MM-DD)')

const participantName = z.string().trim().min(1, 'Name required').max(50)

export const participantCreateSchema = z.object({ name: participantName })
export const participantPatchSchema = z.object({ name: participantName })

export const groupCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Group name required').max(80),
    currency: currencyCode,
    participants: z.array(participantCreateSchema).min(1, 'Add at least one participant').max(50),
  })
  .superRefine((val, ctx) => {
    const names = val.participants.map((p) => p.name.toLowerCase())
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', message: 'Participant names must be unique', path: ['participants'] })
    }
  })

export const groupPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currency: currencyCode.optional(),
})

const minorAmount = z.number().int().min(1).max(MAX_MINOR_AMOUNT)

export const expenseInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Description required').max(200),
    amount: minorAmount,
    currency: currencyCode,
    date: dateString,
    category: categorySlug.default('general'),
    notes: z.string().trim().max(500).nullish(),
    isReimbursement: z.boolean().default(false),
    splitMode: z.enum(SPLIT_MODES),
    paidBy: idString,
    splits: z
      .array(
        z.object({
          participantId: idString,
          splitInput: z.number().int().min(0).max(MAX_MINOR_AMOUNT).nullish(),
        }),
      )
      .min(1, 'Pick who shares this expense')
      .max(100),
    rateOverrideNanos: z.number().int().min(1).max(MAX_RATE_NANOS).nullish(),
  })
  .superRefine((val, ctx) => {
    const ids = val.splits.map((s) => s.participantId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate participants in split', path: ['splits'] })
    }

    const missing = (label: string) =>
      ctx.addIssue({ code: 'custom', message: `Every row needs ${label}`, path: ['splits'] })

    switch (val.splitMode) {
      case 'equal':
        break
      case 'exact': {
        if (val.splits.some((s) => s.splitInput == null)) {
          missing('an amount')
          break
        }
        if (val.splits.reduce((sum, s) => sum + s.splitInput!, 0) !== val.amount) {
          ctx.addIssue({ code: 'custom', message: 'Split amounts must add up to the total', path: ['splits'] })
        }
        break
      }
      case 'percentage': {
        if (val.splits.some((s) => s.splitInput == null)) {
          missing('a percentage')
          break
        }
        if (val.splits.reduce((sum, s) => sum + s.splitInput!, 0) !== 10_000) {
          ctx.addIssue({ code: 'custom', message: 'Percentages must add up to 100%', path: ['splits'] })
        }
        break
      }
      case 'shares': {
        if (val.splits.some((s) => s.splitInput == null || s.splitInput > MAX_SHARE_WEIGHT)) {
          missing('a share count')
          break
        }
        if (val.splits.reduce((sum, s) => sum + s.splitInput!, 0) <= 0) {
          ctx.addIssue({ code: 'custom', message: 'At least one share required', path: ['splits'] })
        }
        break
      }
    }

    if (val.isReimbursement) {
      if (val.splitMode !== 'exact' || val.splits.length !== 1) {
        ctx.addIssue({ code: 'custom', message: 'A payment goes from one person to one person', path: ['splits'] })
      } else if (val.splits[0]!.participantId === val.paidBy) {
        ctx.addIssue({ code: 'custom', message: 'Payer and recipient must differ', path: ['splits'] })
      }
    }
  })

export type GroupCreateInput = z.infer<typeof groupCreateSchema>
export type GroupPatchInput = z.infer<typeof groupPatchSchema>
export type ParticipantCreateInput = z.infer<typeof participantCreateSchema>
export type ExpenseInput = z.infer<typeof expenseInputSchema>
