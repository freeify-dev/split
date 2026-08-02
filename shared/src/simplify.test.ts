import { describe, expect, it } from 'vitest'
import { simplifyDebts } from './simplify'

function makeRng(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('simplifyDebts', () => {
  it('settles a simple triangle', () => {
    const transfers = simplifyDebts([
      { participantId: 'A', net: 1000 },
      { participantId: 'B', net: -600 },
      { participantId: 'C', net: -400 },
    ])
    expect(transfers).toEqual([
      { fromId: 'B', toId: 'A', amount: 600 },
      { fromId: 'C', toId: 'A', amount: 400 },
    ])
  })

  it('returns nothing when already settled', () => {
    expect(simplifyDebts([{ participantId: 'A', net: 0 }])).toEqual([])
    expect(simplifyDebts([])).toEqual([])
  })

  it('applying the transfers zeroes every net, in ≤ n−1 transfers (300 randomized cases)', () => {
    const rng = makeRng(99)
    for (let round = 0; round < 300; round++) {
      const n = 2 + Math.floor(rng() * 8)
      const nets = Array.from({ length: n - 1 }, () => Math.floor(rng() * 20000) - 10000)
      nets.push(-nets.reduce((a, b) => a + b, 0)) // force zero-sum
      const balances = nets.map((net, i) => ({ participantId: `P${i}`, net }))

      const transfers = simplifyDebts(balances)
      expect(transfers.length).toBeLessThanOrEqual(n - 1)

      const applied: Record<string, number> = Object.fromEntries(balances.map((b) => [b.participantId, b.net]))
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0)
        applied[t.fromId]! += t.amount
        applied[t.toId]! -= t.amount
      }
      for (const v of Object.values(applied)) expect(v).toBe(0)
    }
  })
})
