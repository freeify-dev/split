import { currencyExponent } from './currencies'

/**
 * All amounts are integer minor units (cents, yen, fils…). FX rates are integer
 * nanos (rate × 1e9) quoted in major units — nano precision keeps even weak→strong
 * pairs (IDR→KWD ≈ 0.0000187) accurate to ~5 significant digits. Floats never
 * touch money math: products go through BigInt, parsing goes through strings.
 */
export const MAX_MINOR_AMOUNT = 10_000_000_000_000
export const RATE_ONE_NANOS = 1_000_000_000
export const MAX_RATE_NANOS = 1_000_000_000_000_000 // rate of 1,000,000 : plenty for any real pair

export function isValidMinorAmount(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_MINOR_AMOUNT
}

/**
 * Split `total` minor units proportionally to `weights` so the parts sum to
 * exactly `total` (largest-remainder method). Deterministic: leftover units go
 * to the largest remainders first, ties broken by lower index.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(`allocate: bad total ${total}`)
  if (weights.length === 0) throw new RangeError('allocate: no weights')
  let weightSum = 0n
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`allocate: bad weight ${w}`)
    weightSum += BigInt(w)
  }
  if (weightSum <= 0n) throw new RangeError('allocate: weights sum to zero')

  const totalBig = BigInt(total)
  const parts = new Array<number>(weights.length)
  const remainders = new Array<bigint>(weights.length)
  let assigned = 0
  for (let i = 0; i < weights.length; i++) {
    const scaled = totalBig * BigInt(weights[i]!)
    parts[i] = Number(scaled / weightSum)
    remainders[i] = scaled % weightSum
    assigned += parts[i]!
  }

  let shortfall = total - assigned // < weights.length by construction
  if (shortfall > 0) {
    const order = remainders
      .map((_, i) => i)
      .sort((a, b) => (remainders[b]! > remainders[a]! ? 1 : remainders[b]! < remainders[a]! ? -1 : a - b))
    for (let k = 0; k < shortfall; k++) parts[order[k]!]! += 1
  }
  return parts
}

/**
 * Convert minor units of `src` currency into minor units of `dst` currency at
 * `rateNanos` (1 src major = rateNanos/1e9 dst major). Single round-half-up
 * at the end; exact BigInt arithmetic before it.
 */
export function convertMinor(minor: number, src: string, dst: string, rateNanos: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError(`convertMinor: bad amount ${minor}`)
  if (!Number.isSafeInteger(rateNanos) || rateNanos <= 0) throw new RangeError(`convertMinor: bad rate ${rateNanos}`)
  if (src === dst && rateNanos === RATE_ONE_NANOS) return minor

  const expShift = currencyExponent(dst) - currencyExponent(src)
  let numerator = BigInt(minor) * BigInt(rateNanos)
  let denominator = 1_000_000_000n
  if (expShift > 0) numerator *= 10n ** BigInt(expShift)
  else if (expShift < 0) denominator *= 10n ** BigInt(-expShift)

  const result = (numerator + denominator / 2n) / denominator // denominator is even → exact half-up
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('convertMinor: result overflows')
  return Number(result)
}

/** Cross rate src→dst from two EUR-based quotes (1 EUR = q nano-units of each). */
export function crossRateNanos(eurToSrcNanos: number, eurToDstNanos: number): number {
  if (!Number.isSafeInteger(eurToSrcNanos) || eurToSrcNanos <= 0) throw new RangeError('crossRateNanos: bad src quote')
  if (!Number.isSafeInteger(eurToDstNanos) || eurToDstNanos <= 0) throw new RangeError('crossRateNanos: bad dst quote')
  const numerator = BigInt(eurToDstNanos) * 1_000_000_000n
  const denominator = BigInt(eurToSrcNanos)
  const result = (numerator + denominator / 2n) / denominator
  if (result < 1n) return 1
  if (result > BigInt(MAX_RATE_NANOS)) throw new RangeError('crossRateNanos: rate overflows')
  return Number(result)
}

/**
 * Parse a user-typed FX rate ("0.9214", "163,29") into nanos. Returns null on
 * invalid input, zero rates, more than 9 decimals, or rates above 1e6.
 */
export function parseRateToNanos(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '')
  const match = /^(\d{1,7})(?:[.,](\d*))?$/.exec(cleaned)
  if (!match) return null
  const fracPart = match[2] ?? ''
  if (match[2] !== undefined && fracPart.length === 0) return null
  if (fracPart.length > 9) return null
  const nanos = BigInt(match[1]!) * 1_000_000_000n + BigInt(fracPart.padEnd(9, '0') || '0')
  if (nanos <= 0n || nanos > BigInt(MAX_RATE_NANOS)) return null
  return Number(nanos)
}

/**
 * Parse a user-typed amount ("12", "12.50", "12,5") into minor units of
 * `currency`. Returns null on anything invalid, including more decimals than
 * the currency allows. Never touches parseFloat.
 */
export function parseAmount(input: string, currency: string): number | null {
  const exponent = currencyExponent(currency)
  const cleaned = input.trim().replace(/\s/g, '')
  const match = /^(\d{1,13})(?:[.,](\d*))?$/.exec(cleaned)
  if (!match) return null
  const wholePart = match[1]!
  const fracPart = match[2] ?? ''
  if (match[2] !== undefined && fracPart.length === 0) return null // trailing separator
  if (fracPart.length > exponent) return null
  const minorStr = wholePart + fracPart.padEnd(exponent, '0')
  const minor = Number(minorStr)
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR_AMOUNT) return null
  return minor
}

/** Exact decimal string for minor units, e.g. (12345,'USD') → "123.45", (-5,'USD') → "-0.05". */
export function minorToDecimalString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`minorToDecimalString: bad amount ${minor}`)
  const exponent = currencyExponent(currency)
  const sign = minor < 0 ? '-' : ''
  const digits = Math.abs(minor).toString().padStart(exponent + 1, '0')
  if (exponent === 0) return sign + digits
  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`
}

/** Localized currency display, e.g. (12345,'USD') → "$123.45". Display only — never parsed back. */
export function formatMinor(minor: number, currency: string, locale?: string): string {
  const exponent = currencyExponent(currency)
  const value = Number(minorToDecimalString(minor, currency))
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(value)
  } catch {
    return `${minorToDecimalString(minor, currency)} ${currency}`
  }
}

/** Exact decimal string for a nano rate, e.g. 921400000 → "0.9214". */
export function rateNanosToDecimalString(rateNanos: number): string {
  if (!Number.isSafeInteger(rateNanos) || rateNanos < 0) throw new RangeError(`bad rate ${rateNanos}`)
  const whole = Math.trunc(rateNanos / RATE_ONE_NANOS)
  const frac = (rateNanos % RATE_ONE_NANOS).toString().padStart(9, '0').replace(/0+$/, '')
  return frac.length > 0 ? `${whole}.${frac}` : String(whole)
}

/** Human rate line like "1 USD = 0.9214 EUR". */
export function formatRate(rateNanos: number, src: string, dst: string): string {
  return `1 ${src} = ${rateNanosToDecimalString(rateNanos)} ${dst}`
}
