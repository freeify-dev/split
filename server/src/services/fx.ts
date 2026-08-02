import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { crossRateNanos, getCurrency, isCurrencyCode, RATE_ONE_NANOS, type RateSource } from '@solomon/shared'
import type { Db } from '../db/client'
import { fxRates } from '../db/schema'
import { ApiError } from '../lib/errors'

export interface ResolvedRate {
  rateNanos: number
  rateDate: string | null
  source: RateSource
}

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

/**
 * ECB skips weekends and TARGET holidays; ≤5 calendar days of gap is normal.
 * Inside the window we trust the cache; beyond it we try a fetch first.
 */
const MAX_GAP_DAYS = 5
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000)
}

export type FxService = ReturnType<typeof createFxService>

/**
 * Daily ECB reference rates via frankfurter (same data, JSON, keyless, resolves
 * weekend dates to the previous banking day). All quotes cached EUR-based;
 * arbitrary pairs cross through EUR. Expense writes LOCK the resolved rate, so
 * this service is only consulted when an expense is created/re-dated.
 */
export function createFxService(db: Db, opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = opts.baseUrl ?? 'https://api.frankfurter.dev/v1'

  function newestQuoteAtOrBefore(currency: string, date: string) {
    return db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.currency, currency), lte(fxRates.date, date)))
      .orderBy(desc(fxRates.date))
      .limit(1)
      .get()
  }

  /** Fetch one frankfurter document and upsert its quotes under their true banking date. */
  async function fetchAndStore(path: string): Promise<void> {
    const res = await fetchImpl(`${baseUrl}/${path}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`frankfurter ${path}: HTTP ${res.status}`)
    const data = (await res.json()) as FrankfurterResponse
    if (!data || typeof data.date !== 'string' || typeof data.rates !== 'object') {
      throw new Error('frankfurter: unexpected payload')
    }
    const now = Date.now()
    const rows = Object.entries(data.rates)
      .filter(([code, value]) => isCurrencyCode(code) && typeof value === 'number' && value > 0)
      .map(([code, value]) => ({ date: data.date, currency: code, rateNanos: Math.round(value * 1e9), fetchedAt: now }))
      .filter((row) => Number.isSafeInteger(row.rateNanos) && row.rateNanos > 0)
    if (rows.length === 0) return
    db.insert(fxRates)
      .values(rows)
      .onConflictDoUpdate({
        target: [fxRates.date, fxRates.currency],
        set: { rateNanos: sql`excluded.rate_nanos`, fetchedAt: sql`excluded.fetched_at` },
      })
      .run()
  }

  /** Cross src→dst through cached EUR quotes at the newest banking day ≤ date. */
  function cachedPair(src: string, dst: string, date: string): { rateNanos: number; rateDate: string } | null {
    const srcQuote = src === 'EUR' ? { rateNanos: RATE_ONE_NANOS, date: null } : newestQuoteAtOrBefore(src, date)
    const dstQuote = dst === 'EUR' ? { rateNanos: RATE_ONE_NANOS, date: null } : newestQuoteAtOrBefore(dst, date)
    if (!srcQuote || !dstQuote) return null
    const realDates = [srcQuote.date, dstQuote.date].filter((d): d is string => d !== null)
    return {
      rateNanos: crossRateNanos(srcQuote.rateNanos, dstQuote.rateNanos),
      rateDate: realDates.sort()[0] ?? date, // oldest quote involved; EUR↔EUR is handled before this
    }
  }

  async function resolveRate(src: string, dst: string, date: string): Promise<ResolvedRate> {
    if (src === dst) return { rateNanos: RATE_ONE_NANOS, rateDate: null, source: 'same' }
    for (const code of [src, dst]) {
      if (code !== 'EUR' && !getCurrency(code).ecb) {
        throw new ApiError(503, 'RATE_UNAVAILABLE', `There is no automatic rate for ${code} — enter the rate manually`)
      }
    }

    const cached = cachedPair(src, dst, date)
    if (cached && daysBetween(cached.rateDate, date) <= MAX_GAP_DAYS) {
      return { ...cached, source: 'ecb' }
    }

    try {
      await fetchAndStore(`${date}?base=EUR`)
      const fresh = cachedPair(src, dst, date)
      if (fresh) return { ...fresh, source: 'ecb' }
    } catch {
      if (cached) return { ...cached, source: 'fallback' }
    }
    throw new ApiError(503, 'RATE_UNAVAILABLE', 'Exchange rates are unavailable right now — enter the rate manually')
  }

  async function refreshLatest(): Promise<void> {
    await fetchAndStore('latest?base=EUR')
  }

  /** Boot + every 6h; ECB publishes ~16:00 CET, this sidesteps timezone math. */
  function startRefreshLoop(): () => void {
    const kick = () =>
      void refreshLatest().catch((err: unknown) => {
        console.warn('fx refresh failed:', err instanceof Error ? err.message : err)
      })
    kick()
    const interval = setInterval(kick, REFRESH_INTERVAL_MS)
    interval.unref()
    return () => clearInterval(interval)
  }

  return { resolveRate, refreshLatest, startRefreshLoop }
}
