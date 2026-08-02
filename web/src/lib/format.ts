import { formatMinor } from '@solomon/shared'

export function money(minor: number, currency: string): string {
  return formatMinor(minor, currency, navigator.language)
}

/** Parse 'YYYY-MM-DD' as a LOCAL date (new Date(str) would treat it as UTC and can shift the day). */
function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function shortDate(date: string): string {
  return new Intl.DateTimeFormat(navigator.language, { day: 'numeric', month: 'short' }).format(parseLocalDate(date))
}

export function fullDate(date: string): string {
  return new Intl.DateTimeFormat(navigator.language, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    parseLocalDate(date),
  )
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto' })
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of table) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit)
  }
  return rtf.format(seconds, 'second')
}

/** Today as a local 'YYYY-MM-DD' (never via toISOString, which is UTC). */
export function todayString(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}
