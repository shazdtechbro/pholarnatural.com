import { apiClient } from './client'

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').replace(/\/$/, '')

const TOKEN_KEY = 'pholar_admin_token'

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function adminLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password })
  const res = await fetch(`${BASE}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.access_token as string
}

export async function adminLogout(): Promise<void> {
  await apiClient('/api/v1/admin/logout', { method: 'POST', auth: true }).catch(() => {})
}

export async function adminRegister(
  email: string,
  password: string,
  secretKey: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/admin/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, secret_key: secretKey }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`)
  }
}

export interface DashboardOrder {
  id: string
  order_number: string
  customer_name: string
  total_cents: number
  status: string
  created_at: string
}

export interface DashboardBooking {
  id: string
  customer_name: string
  service_id: string
  service_name: string
  booking_date: string
  start_time: string
  status: string
}

export interface DashboardStats {
  orders_today: number
  revenue_today_cents: number
  revenue_total_cents: number
  bookings_today: number
  recent_orders: DashboardOrder[]
  upcoming_bookings: DashboardBooking[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiClient<DashboardStats>('/api/v1/admin/dashboard', { auth: true })
}
