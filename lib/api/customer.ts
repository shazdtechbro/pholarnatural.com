import type { CartItem } from '@/lib/types'

export interface Customer { id: string; name: string; email: string; verified: boolean }
export interface SavedCart { items: CartItem[]; version: number }
export interface AccountHistory {
  orders: { id: string; reference: string; date: string; status: string; total_cents: number; url: string }[]
  bookings: { id: string; service: string; date: string; time: string; status: string; deposit_cents: number; url: string }[]
}
export class AccountError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const base = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').replace(/\/$/, '')

/** Customer sessions live in an HttpOnly cookie, separate from the admin's bearer token. */
export async function accountApi<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`${base}/api/v1/account${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new AccountError(response.status, typeof result.detail === 'string' ? result.detail : 'Please check your details and try again.')
  return result as T
}
