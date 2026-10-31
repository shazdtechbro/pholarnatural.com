import { CURRENCY, DEPOSIT_RATE } from './config'
import type { Cents } from './types'

/**
 * Money formatting. Each purchase retains its currency, which is always shown explicitly,
 * because the store sells internationally and "$25.00" alone is ambiguous.
 *
 * A fixed 'en-CA' locale is passed on purpose: `Intl` with an undefined locale resolves
 * differently on the server and in the browser, which produces a hydration mismatch.
 */
const formatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
})

/** `2500` → `"CAD $25.00"` */
export function formatPrice(cents: Cents, currency: string = CURRENCY): string {
  const selected = currency === CURRENCY ? formatter : new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: 2 })
  return `${currency} ${selected.format(cents / 100).replace(/^(CA|US)\$/, '$')}`
}

/** `2500` → `"$25.00"` — for dense tables where the CAD is stated once in a header. */
export function formatPriceShort(cents: Cents): string {
  return formatter.format(cents / 100).replace(/^CA\$/, '$')
}

/** doc §1.6.4 — 10% deposit, rounded to the nearest cent. */
export function depositFor(priceCents: Cents): Cents {
  return Math.round(priceCents * DEPOSIT_RATE)
}

/** `60` → `"1 hr"`, `90` → `"1 hr 30 min"`, `45` → `"45 min"` */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

/** `"14:00"` → `"2:00 PM"` */
export function formatTime(time24: string): string {
  const [hRaw, m] = time24.split(':')
  const h = Number(hRaw)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${period}`
}

/** `"2026-08-14"` → `"Friday, 14 August 2026"`. Parsed as local, not UTC, to avoid off-by-one. */
export function formatDateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** `"2026-08-14"` → `"14 Aug 2026"` */
export function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Local-timezone `YYYY-MM-DD`. `toISOString()` is wrong here — it shifts to UTC. */
export function toISODate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** `"10:00"` + 60 → `"11:00"` */
export function addMinutes(time24: string, minutes: number): string {
  const [h, m] = time24.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

