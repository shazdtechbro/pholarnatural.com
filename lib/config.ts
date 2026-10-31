/**
 * Business rules from IMPLEMENTATION-DOC.md §7 and §1.6.
 *
 * Everything the client can still change lives here, so a policy tweak is a one-line edit
 * rather than a hunt through components.
 */

export const CURRENCY: 'USD' | 'CAD' = process.env.NEXT_PUBLIC_CURRENCY === 'USD' ? 'USD' : 'CAD'

/** doc §1.6.4 — bookings are held with a 10% deposit. */
export const DEPOSIT_RATE = 0.1

/**
 * doc §1.6.2 — Mon–Sat only. 0 = Sunday … 6 = Saturday.
 * Sunday is the only closed day, and it is rendered disabled rather than hidden.
 */
export const OPEN_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const

/** doc §1.6.3 — 60-minute slots, 10:00 through 16:00 (last appointment ends at 17:00). */
export const SLOT_TIMES = [
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
] as const

export const SLOT_DURATION_MINUTES = 60

/**
 * doc §1.13 / §8.6 — cancellation policy.
 *
 * The middle window (between the 30-minute grace period and the 24-hour forfeit cutoff) is
 * STILL UNCONFIRMED by the client. `middleWindowRefundRate` is intentionally `null`, and the UI
 * renders "contact us" copy while it stays null. Do not substitute a guessed percentage —
 * set it here once the client confirms.
 */
export const CANCELLATION_POLICY = {
  /** Full refund if cancelled within this many minutes of booking. */
  fullRefundWithinMinutes: 30,
  /** Deposit is forfeited if cancelled within this many hours of the appointment. */
  forfeitWithinHours: 24,
  /** TBD — see doc §8 item 6. */
  middleWindowRefundRate: null as number | null,
} as const

export const BUSINESS = {
  name: 'Pholar Natural',
  tagline: "Nature's finest for your crown",
  email: 'hello@pholarnatural.com',
  phone: '+1 (416) 555-0142',
  addressLines: ['Botanical District', 'Studio 104', 'Toronto, Canada'],
  /** Mirrors OPEN_WEEKDAYS / SLOT_TIMES above — keep the two in step. */
  hours: 'Mon–Sat, 10:00 AM – 5:00 PM',
} as const

/**
 * Canonical site URL. Used for metadataBase, sitemap, robots and OG tags.
 * Domain purchase is still pending (doc §8.1) — override with NEXT_PUBLIC_SITE_URL once live.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pholarnatural.com'
