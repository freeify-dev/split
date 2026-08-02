import { describe, expect, it } from 'vitest'
import {
  allocate,
  convertMinor,
  crossRateNanos,
  formatMinor,
  formatRate,
  isValidMinorAmount,
  minorToDecimalString,
  parseAmount,
  parseRateToNanos,
  RATE_ONE_NANOS,
} from './money'

/** Deterministic PRNG (mulberry32) so property loops are reproducible. */
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

describe('isValidMinorAmount', () => {
  it('accepts positive safe integers and rejects the rest', () => {
    expect(isValidMinorAmount(1)).toBe(true)
    expect(isValidMinorAmount(0)).toBe(false)
    expect(isValidMinorAmount(-5)).toBe(false)
    expect(isValidMinorAmount(1.5)).toBe(false)
    expect(isValidMinorAmount(Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})

describe('allocate', () => {
  it('splits 100.00 three ways with pennies to the front', () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333])
  })

  it('handles proportional shares by largest remainder', () => {
    expect(allocate(1000, [1, 2, 3])).toEqual([167, 333, 500])
  })

  it('handles basis-point percentages exactly', () => {
    expect(allocate(100, [3333, 3333, 3334])).toEqual([33, 33, 34])
  })

  it('allows zero total and zero weights (but not all-zero)', () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0])
    expect(allocate(500, [0, 1])).toEqual([0, 500])
    expect(() => allocate(500, [0, 0])).toThrow()
  })

  it('rejects invalid inputs', () => {
    expect(() => allocate(-1, [1])).toThrow()
    expect(() => allocate(1.5, [1])).toThrow()
    expect(() => allocate(100, [])).toThrow()
    expect(() => allocate(100, [-1, 2])).toThrow()
  })

  it('always sums to the total (1000 randomized cases)', () => {
    const rng = makeRng(42)
    for (let i = 0; i < 1000; i++) {
      const total = Math.floor(rng() * 10_000_000)
      const n = 1 + Math.floor(rng() * 12)
      const weights: number[] = Array.from({ length: n }, () => Math.floor(rng() * 5000))
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1
      const parts = allocate(total, weights)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      expect(parts.every((p) => Number.isSafeInteger(p) && p >= 0)).toBe(true)
    }
  })
})

describe('parseAmount', () => {
  it('parses the float-trap cases exactly', () => {
    expect(parseAmount('0.1', 'USD')).toBe(10)
    expect(parseAmount('1.1', 'USD')).toBe(110)
    expect(parseAmount('123.45', 'USD')).toBe(12345)
  })

  it('respects currency exponents', () => {
    expect(parseAmount('1000', 'JPY')).toBe(1000)
    expect(parseAmount('1.234', 'BHD')).toBe(1234)
    expect(parseAmount('1.2', 'BHD')).toBe(1200)
  })

  it('accepts comma as decimal separator', () => {
    expect(parseAmount('12,5', 'EUR')).toBe(1250)
  })

  it('rejects too many decimals for the currency', () => {
    expect(parseAmount('1.005', 'USD')).toBeNull()
    expect(parseAmount('1.5', 'JPY')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseAmount('', 'USD')).toBeNull()
    expect(parseAmount('.', 'USD')).toBeNull()
    expect(parseAmount('1.', 'USD')).toBeNull()
    expect(parseAmount('abc', 'USD')).toBeNull()
    expect(parseAmount('-5', 'USD')).toBeNull()
    expect(parseAmount('1e3', 'USD')).toBeNull()
    expect(parseAmount('99999999999999999', 'USD')).toBeNull()
  })
})

describe('parseRateToNanos', () => {
  it('parses decimal rates exactly', () => {
    expect(parseRateToNanos('0.9214')).toBe(921_400_000)
    expect(parseRateToNanos('163,29')).toBe(163_290_000_000)
    expect(parseRateToNanos('1')).toBe(RATE_ONE_NANOS)
    expect(parseRateToNanos('0.000000001')).toBe(1)
  })

  it('rejects zero, malformed and out-of-range rates', () => {
    expect(parseRateToNanos('0')).toBeNull()
    expect(parseRateToNanos('')).toBeNull()
    expect(parseRateToNanos('1.')).toBeNull()
    expect(parseRateToNanos('0.0000000001')).toBeNull() // 10 decimals
    expect(parseRateToNanos('1000001')).toBeNull() // above max rate 1e6
  })
})

describe('convertMinor', () => {
  it('is identity at rate 1 for same currency', () => {
    expect(convertMinor(12345, 'USD', 'USD', RATE_ONE_NANOS)).toBe(12345)
  })

  it('shifts exponents 0→2 (JPY→EUR)', () => {
    // 1 JPY = 0.0065 EUR → 1000 yen = 6.50 EUR = 650 cents
    expect(convertMinor(1000, 'JPY', 'EUR', 6_500_000)).toBe(650)
  })

  it('shifts exponents 3→2 (BHD→USD)', () => {
    // 1 BHD = 2.65 USD → 1.234 BHD = 3.2701 USD → 327 cents (half-up)
    expect(convertMinor(1234, 'BHD', 'USD', 2_650_000_000)).toBe(327)
  })

  it('rounds half up', () => {
    expect(convertMinor(1, 'USD', 'EUR', 500_000_000)).toBe(1) // 0.5 → 1
    expect(convertMinor(1, 'USD', 'EUR', 499_900_000)).toBe(0) // 0.4999 → 0
  })

  it('keeps precision on weak→strong pairs', () => {
    // 1 IDR = 0.000061 USD → 10,000,000,000.00 IDR = 610,000.00 USD
    expect(convertMinor(1_000_000_000_000, 'IDR', 'USD', 61_000)).toBe(61_000_000)
  })

  it('throws on unsafe results instead of losing precision', () => {
    expect(() => convertMinor(10_000_000_000_000, 'USD', 'USD', 1_000_000_000_000_000)).toThrow()
  })
})

describe('crossRateNanos', () => {
  it('crosses via EUR quotes exactly on clean numbers', () => {
    // EUR→USD 2.0, EUR→GBP 1.0 ⇒ USD→GBP 0.5
    expect(crossRateNanos(2_000_000_000, 1_000_000_000)).toBe(500_000_000)
  })

  it('crosses realistic quotes to nano precision', () => {
    // EUR→USD 1.085, EUR→JPY 163.0 ⇒ USD→JPY ≈ 150.230414746
    const rate = crossRateNanos(1_085_000_000, 163_000_000_000)
    expect(rate).toBeGreaterThanOrEqual(150_230_414_745)
    expect(rate).toBeLessThanOrEqual(150_230_414_748)
  })

  it('round-trips reciprocals within a part per million', () => {
    const ab = crossRateNanos(1_085_000_000, 163_000_000_000)
    const ba = crossRateNanos(163_000_000_000, 1_085_000_000)
    const product = BigInt(ab) * BigInt(ba) // ~1e18 when reciprocal
    expect(product).toBeGreaterThan(999_999_000_000_000_000n)
    expect(product).toBeLessThan(1_000_001_000_000_000_000n)
  })
})

describe('decimal strings and formatting', () => {
  it('renders exact decimal strings', () => {
    expect(minorToDecimalString(12345, 'USD')).toBe('123.45')
    expect(minorToDecimalString(-5, 'USD')).toBe('-0.05')
    expect(minorToDecimalString(7, 'JPY')).toBe('7')
    expect(minorToDecimalString(1, 'BHD')).toBe('0.001')
    expect(minorToDecimalString(0, 'EUR')).toBe('0.00')
  })

  it('formats via Intl for known locales', () => {
    expect(formatMinor(12345, 'USD', 'en-US')).toBe('$123.45')
    expect(formatMinor(1000, 'JPY', 'en-US')).toBe('¥1,000')
  })

  it('formats rates human-readably', () => {
    expect(formatRate(921_400_000, 'USD', 'EUR')).toBe('1 USD = 0.9214 EUR')
    expect(formatRate(RATE_ONE_NANOS, 'USD', 'USD')).toBe('1 USD = 1 USD')
  })
})
