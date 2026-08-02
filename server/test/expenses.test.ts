import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApiErrorBody, BalancesDto, ExpenseDto, RateDto } from '@solomon/shared'
import { fxRates } from '../src/db/schema'
import { makeTestApp, type TestApp } from './helper'

let t: TestApp
beforeEach(() => {
  t = makeTestApp()
})
afterEach(() => t.close())

function seedRates(rows: { date: string; currency: string; rateNanos: number }[]) {
  t.db
    .insert(fxRates)
    .values(rows.map((r) => ({ ...r, fetchedAt: Date.now() })))
    .run()
}

const expenseBody = (paidBy: string, splitIds: string[], overrides: Record<string, unknown> = {}) => ({
  description: 'Dinner',
  amount: 3000,
  currency: 'EUR',
  date: '2026-07-20',
  splitMode: 'equal',
  paidBy,
  splits: splitIds.map((participantId) => ({ participantId })),
  ...overrides,
})

describe('expense CRUD + balances', () => {
  it('creates an equal-split expense and computes balances', async () => {
    const group = await t.createGroup()
    const [ana, ben, cleo] = group.participants
    const created = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [ana!.id, ben!.id, cleo!.id]),
      actor: ana!.id,
    })
    expect(created.status).toBe(201)
    const dto = (await created.json()) as ExpenseDto
    expect(dto.rateSource).toBe('same')
    expect(dto.splits.map((s) => s.owedAmount)).toEqual([1000, 1000, 1000])
    expect(dto.payers).toEqual([{ participantId: ana!.id, amount: 3000 }])

    const balances = (await (await t.request(`/api/groups/${group.id}/balances`)).json()) as BalancesDto
    expect(balances.currency).toBe('EUR')
    expect(balances.balances).toEqual([
      { participantId: ana!.id, net: 2000 },
      { participantId: ben!.id, net: -1000 },
      { participantId: cleo!.id, net: -1000 },
    ])
    expect(balances.transfers).toEqual([
      { fromId: ben!.id, toId: ana!.id, amount: 1000 },
      { fromId: cleo!.id, toId: ana!.id, amount: 1000 },
    ])
  })

  it('rejects exact splits that do not sum and unknown participants', async () => {
    const group = await t.createGroup()
    const [ana, ben] = group.participants
    const badSum = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [], {
        splitMode: 'exact',
        splits: [
          { participantId: ana!.id, splitInput: 1000 },
          { participantId: ben!.id, splitInput: 1000 },
        ],
      }),
    })
    expect(badSum.status).toBe(422)

    const stranger = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [ana!.id, 'notamember00']),
    })
    expect(stranger.status).toBe(422)
  })

  it('allocates percentage and share splits server-side', async () => {
    const group = await t.createGroup()
    const [ana, ben, cleo] = group.participants
    const res = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [], {
        amount: 10000,
        splitMode: 'percentage',
        splits: [
          { participantId: ana!.id, splitInput: 3333 },
          { participantId: ben!.id, splitInput: 3333 },
          { participantId: cleo!.id, splitInput: 3334 },
        ],
      }),
    })
    const dto = (await res.json()) as ExpenseDto
    expect(dto.splits.map((s) => s.owedAmount)).toEqual([3333, 3333, 3334])
    expect(dto.splits.reduce((a, s) => a + s.owedAmount, 0)).toBe(10000)

    const shares = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [], {
        amount: 1000,
        splitMode: 'shares',
        splits: [
          { participantId: ana!.id, splitInput: 1 },
          { participantId: ben!.id, splitInput: 2 },
          { participantId: cleo!.id, splitInput: 3 },
        ],
      }),
    })
    const sharesDto = (await shares.json()) as ExpenseDto
    expect(sharesDto.splits.map((s) => s.owedAmount)).toEqual([167, 333, 500])
  })

  it('updates and deletes expenses, unlocking participant removal', async () => {
    const group = await t.createGroup()
    const [ana, ben, cleo] = group.participants
    const created = (await (
      await t.request(`/api/groups/${group.id}/expenses`, {
        method: 'POST',
        json: expenseBody(ana!.id, [ana!.id, ben!.id, cleo!.id]),
      })
    ).json()) as ExpenseDto

    const blocked = await t.request(`/api/groups/${group.id}/participants/${cleo!.id}`, { method: 'DELETE' })
    expect(blocked.status).toBe(409)

    const updated = await t.request(`/api/groups/${group.id}/expenses/${created.id}`, {
      method: 'PUT',
      json: expenseBody(ana!.id, [ana!.id, ben!.id], { description: 'Dinner v2' }),
    })
    expect(updated.status).toBe(200)
    const updatedDto = (await updated.json()) as ExpenseDto
    expect(updatedDto.description).toBe('Dinner v2')
    expect(updatedDto.splits).toHaveLength(2)
    expect(updatedDto.createdAt).toBe(created.createdAt)

    const removal = await t.request(`/api/groups/${group.id}/participants/${cleo!.id}`, { method: 'DELETE' })
    expect(removal.status).toBe(204)

    const del = await t.request(`/api/groups/${group.id}/expenses/${created.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
    expect((await t.request(`/api/groups/${group.id}/expenses/${created.id}`)).status).toBe(404)
  })
})

describe('multi-currency', () => {
  it('locks an ECB cross rate and keeps group nets at zero', async () => {
    // group in EUR; USD expense on Monday with only Friday's quote cached
    seedRates([{ date: '2026-07-17', currency: 'USD', rateNanos: 1_085_000_000 }]) // 1 EUR = 1.085 USD
    const group = await t.createGroup()
    const [ana, ben] = group.participants
    const res = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [ana!.id, ben!.id], { currency: 'USD', amount: 10000 }),
    })
    expect(res.status).toBe(201)
    const dto = (await res.json()) as ExpenseDto
    expect(dto.rateSource).toBe('ecb')
    expect(dto.rateDate).toBe('2026-07-17')
    // USD→EUR = 1/1.085 ≈ 0.921658986…, $100.00 → 92.17 EUR
    expect(dto.rateNanos).toBe(921_658_986)

    const balances = (await (await t.request(`/api/groups/${group.id}/balances`)).json()) as BalancesDto
    const total = balances.balances.reduce((a, b) => a + b.net, 0)
    expect(total).toBe(0)
    expect(balances.balances[0]!.net).toBe(4608) // 9217 − 4609, penny to the first split
  })

  it('serves the rate endpoint and 503s with an empty cache', async () => {
    const group = await t.createGroup()
    const ok = await t.request(`/api/groups/${group.id}/rate?currency=EUR&date=2026-07-20`)
    expect(((await ok.json()) as RateDto).source).toBe('same')

    const unavailable = await t.request(`/api/groups/${group.id}/rate?currency=USD&date=2026-07-20`)
    expect(unavailable.status).toBe(503)
    expect(((await unavailable.json()) as ApiErrorBody).error.code).toBe('RATE_UNAVAILABLE')

    const manualOnly = await t.request(`/api/groups/${group.id}/rate?currency=EGP&date=2026-07-20`)
    expect(manualOnly.status).toBe(503)
  })

  it('falls back to a stale cached rate when the feed is down', async () => {
    seedRates([{ date: '2026-06-01', currency: 'USD', rateNanos: 1_100_000_000 }])
    const group = await t.createGroup()
    const res = await t.request(`/api/groups/${group.id}/rate?currency=USD&date=2026-07-20`)
    expect(res.status).toBe(200)
    const rate = (await res.json()) as RateDto
    expect(rate.source).toBe('fallback')
    expect(rate.rateDate).toBe('2026-06-01')
  })

  it('honours manual rate overrides without polluting the cache', async () => {
    const group = await t.createGroup()
    const [ana, ben] = group.participants
    const res = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [ana!.id, ben!.id], { currency: 'USD', amount: 10000, rateOverrideNanos: 900_000_000 }),
    })
    expect(res.status).toBe(201)
    const dto = (await res.json()) as ExpenseDto
    expect(dto.rateSource).toBe('manual')
    expect(dto.rateNanos).toBe(900_000_000)
    expect(t.db.select().from(fxRates).all()).toHaveLength(0)
  })

  it('keeps the locked rate on edits that change nothing rate-relevant', async () => {
    seedRates([{ date: '2026-07-17', currency: 'USD', rateNanos: 1_085_000_000 }])
    const group = await t.createGroup()
    const [ana, ben] = group.participants
    const created = (await (
      await t.request(`/api/groups/${group.id}/expenses`, {
        method: 'POST',
        json: expenseBody(ana!.id, [ana!.id, ben!.id], { currency: 'USD', amount: 10000 }),
      })
    ).json()) as ExpenseDto

    // the market "moves"…
    t.db.delete(fxRates).run()
    seedRates([{ date: '2026-07-20', currency: 'USD', rateNanos: 2_000_000_000 }])

    const updated = (await (
      await t.request(`/api/groups/${group.id}/expenses/${created.id}`, {
        method: 'PUT',
        json: expenseBody(ana!.id, [ana!.id, ben!.id], { currency: 'USD', amount: 10000, description: 'renamed' }),
      })
    ).json()) as ExpenseDto
    expect(updated.rateNanos).toBe(created.rateNanos) // untouched

    const redated = (await (
      await t.request(`/api/groups/${group.id}/expenses/${created.id}`, {
        method: 'PUT',
        json: expenseBody(ana!.id, [ana!.id, ben!.id], { currency: 'USD', amount: 10000, date: '2026-07-21' }),
      })
    ).json()) as ExpenseDto
    expect(redated.rateNanos).toBe(500_000_000) // re-resolved at the new date
  })

  it('rejects a group currency change once expenses exist', async () => {
    const group = await t.createGroup()
    const [ana, ben] = group.participants
    await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [ana!.id, ben!.id]),
    })
    const res = await t.request(`/api/groups/${group.id}`, { method: 'PATCH', json: { currency: 'USD' } })
    expect(res.status).toBe(409)
  })
})

describe('settle up (reimbursement expenses)', () => {
  it('zeroes balances and shows in transfers no more', async () => {
    const group = await t.createGroup({ participants: [{ name: 'Ana' }, { name: 'Ben' }] })
    const [ana, ben] = group.participants
    await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ben!.id, [ana!.id, ben!.id], { amount: 1000 }),
    })

    let balances = (await (await t.request(`/api/groups/${group.id}/balances`)).json()) as BalancesDto
    expect(balances.transfers).toEqual([{ fromId: ana!.id, toId: ben!.id, amount: 500 }])

    const settle = await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [], {
        description: 'Settle up',
        amount: 500,
        isReimbursement: true,
        splitMode: 'exact',
        splits: [{ participantId: ben!.id, splitInput: 500 }],
      }),
      actor: ana!.id,
    })
    expect(settle.status).toBe(201)

    balances = (await (await t.request(`/api/groups/${group.id}/balances`)).json()) as BalancesDto
    expect(balances.balances.every((b) => b.net === 0)).toBe(true)
    expect(balances.transfers).toEqual([])
  })
})

describe('CSV export', () => {
  it('exports with BOM, per-participant columns and formula escaping', async () => {
    const group = await t.createGroup()
    const [ana, ben, cleo] = group.participants
    await t.request(`/api/groups/${group.id}/expenses`, {
      method: 'POST',
      json: expenseBody(ana!.id, [ana!.id, ben!.id, cleo!.id], { description: '=SUM(A1:A9), "dinner"' }),
    })

    const res = await t.request(`/api/groups/${group.id}/export.csv`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM on the wire
    const text = new TextDecoder().decode(bytes) // decoder strips the BOM
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toContain('Owed by Ana')
    expect(lines[1]).toContain(`"'=SUM(A1:A9), ""dinner"""`)
    expect(lines[1]).toContain('30.00')
    expect(lines[1]).toContain('10.00')
  })
})
