import { apiClient } from './client'

export interface AdminBooking {
  id: string
  service_id: string
  service_name: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  booking_date: string
  start_time: string
  end_time: string
  status: string
  deposit_cents: number
  cancellation_reason: string | null
  reference: string
}

export interface AdminBlockedDate {
  id: string
  date: string
  reason: string | null
  created_at: string
}

export function listAdminBookings(params?: {
  filter_date?: string
  status?: string
}): Promise<AdminBooking[]> {
  const qs = new URLSearchParams()
  if (params?.filter_date) qs.set('filter_date', params.filter_date)
  if (params?.status) qs.set('status', params.status)
  const q = qs.toString()
  return apiClient<AdminBooking[]>(`/api/v1/admin/bookings/${q ? `?${q}` : ''}`, { auth: true })
}

export function confirmBooking(id: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/bookings/${id}/confirm`, { method: 'PUT', auth: true })
}

export function cancelBookingAdmin(
  id: string,
  reason?: string | null,
): Promise<{ status: string; refunded: boolean; refund_policy_message: string }> {
  return apiClient<{ status: string; refunded: boolean; refund_policy_message: string }>(
    `/api/v1/admin/bookings/${id}/cancel`,
    {
      method: 'PUT',
      body: { cancellation_reason: reason ?? null },
      auth: true,
    },
  )
}

export function listAdminBlockedDates(): Promise<AdminBlockedDate[]> {
  return apiClient<AdminBlockedDate[]>('/api/v1/admin/bookings/blocked-dates', { auth: true })
}

export function blockDate(date: string, reason?: string | null): Promise<AdminBlockedDate> {
  return apiClient<AdminBlockedDate>('/api/v1/admin/bookings/blocked-dates', {
    method: 'POST',
    body: { date, reason: reason ?? null },
    auth: true,
  })
}

export function unblockDate(id: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/bookings/blocked-dates/${id}`, {
    method: 'DELETE',
    auth: true,
  })
}
