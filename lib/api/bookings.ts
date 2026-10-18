import type { Slot } from '@/lib/data'
import { apiClient } from './client'

// ─── Raw backend shapes ───────────────────────────────────────────────────────

interface RawSlotInfo {
  time: string
  available: boolean
}

interface RawSlotsResponse {
  date: string
  slots: RawSlotInfo[]
}

interface RawBlockedDate {
  id: string
  date: string
  reason: string | null
  created_at: string
}

// ─── Public payload / response types ─────────────────────────────────────────

export interface BookingPayload {
  service_id: string
  customer_name: string
  customer_email: string
  customer_phone?: string | null
  booking_date: string // YYYY-MM-DD
  start_time: string // HH:MM
}

/** Phase 9: backend creates a Payment Intent for the 10% deposit. */
export interface BookingDepositResponse {
  booking_id: string
  confirmation_token: string
  reference: string
  client_secret: string
  publishable_key: string
  amount_cents: number // deposit amount
  booking_date: string
  start_time: string
  end_time: string
  status: string
}

export interface BookingCancelResponse {
  id: string
  status: string
  cancellation_reason: string | null
  refunded: boolean
  refund_policy_message: string
}

// ─── Public functions ─────────────────────────────────────────────────────────

export async function getBlockedDates(): Promise<string[]> {
  const raw = await apiClient<RawBlockedDate[]>('/api/v1/bookings/blocked-dates', {})
  return raw.map((b) => b.date)
}

export async function getAvailableSlots(date: string, serviceId?: string): Promise<Slot[]> {
  const params = new URLSearchParams({ date })
  if (serviceId) params.set('service_id', serviceId)
  const raw = await apiClient<RawSlotsResponse>(`/api/v1/bookings/slots?${params}`)
  return raw.slots.map((s) => ({
    time: s.time,
    available: s.available,
    ...(!s.available ? { reason: 'booked' as const } : {}),
  }))
}

export async function createBooking(payload: BookingPayload): Promise<BookingDepositResponse> {
  return apiClient<BookingDepositResponse>('/api/v1/bookings/', {
    method: 'POST',
    body: {
      ...payload,
      // Pydantic time field expects HH:MM:SS
      start_time: payload.start_time.length === 5 ? `${payload.start_time}:00` : payload.start_time,
    },
  })
}

export async function cancelBooking(
  bookingId: string,
  reason?: string,
  token?: string,
): Promise<BookingCancelResponse> {
  return apiClient<BookingCancelResponse>(`/api/v1/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: { cancellation_reason: reason ?? null },
    headers: { 'X-Confirmation-Token': token ?? '' },
  })
}

export type BookingConfirmation = Omit<import('@/lib/types').Booking, 'status'> & {
  service_name: string
  status: string
}
export const getBookingConfirmation = (id: string, token: string) =>
  apiClient<BookingConfirmation>(`/api/v1/bookings/${encodeURIComponent(id)}`, {
    headers: { 'X-Confirmation-Token': token },
  })
