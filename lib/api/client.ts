/**
 * Centralized HTTP client for the Pholar Natural FastAPI backend.
 *
 * This is the only file that knows about the base URL, auth headers, and
 * error shape. Resource-specific modules (products, bookings, orders, …)
 * import `apiClient` from here and add nothing transport-level of their own.
 */

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').replace(/\/$/, '')

// ─── Error type ───────────────────────────────────────────────────────────────

/** Thrown by `apiClient` for every non-2xx response. */
export class ApiError extends Error {
  constructor(
    /** HTTP status code, e.g. 404, 422, 500. */
    public readonly status: number,
    message: string,
    /** The raw JSON body from the server, if it could be parsed. */
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

// ─── Request options ──────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiClientOptions {
  method?: HttpMethod
  /** Any JSON-serialisable value — will be stringified and sent as the request body. */
  body?: unknown
  /** Extra headers merged on top of the defaults. */
  headers?: Record<string, string>
  /**
   * Set `true` on admin-only calls. Reads the JWT stored in `sessionStorage`
   * (client-side only) and injects it as `Authorization: Bearer <token>`.
   */
  auth?: boolean
  /**
   * Next.js fetch cache control for Server Components.
   * `{ revalidate: 60 }` → ISR every 60 s
   * `{ tags: ['products'] }` → tag-based revalidation via `revalidateTag`
   * Omit to let Next decide (default: force-cache in production).
   */
  next?: NextFetchRequestConfig
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * Makes a request to the FastAPI backend and returns the parsed JSON body
 * typed as `T`.
 *
 * - Throws `ApiError` for any non-2xx response. The `status` field mirrors
 *   the HTTP code; `message` is extracted from FastAPI's `detail` field when
 *   present, otherwise falls back to `"HTTP <status>"`.
 * - Returns `undefined` (cast to `T`) for 204 No Content responses.
 *
 * @example
 *   // Server Component — products list, revalidated every 5 minutes
 *   const products = await apiClient<RawProduct[]>('/api/v1/products/', {
 *     next: { revalidate: 300 },
 *   })
 *
 *   // Client Component — create a booking (POST with body)
 *   const result = await apiClient<BookingCheckoutResponse>('/api/v1/bookings/', {
 *     method: 'POST',
 *     body: payload,
 *   })
 *
 *   // Admin call — requires JWT from sessionStorage
 *   const orders = await apiClient<Order[]>('/api/v1/admin/orders/', { auth: true })
 */
export async function apiClient<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const { method = 'GET', body, headers: extraHeaders = {}, auth = false } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }

  if (auth && typeof window !== 'undefined') {
    const token = sessionStorage.getItem('pholar_admin_token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    if (auth && response.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('pholar_admin_token')
      window.dispatchEvent(new Event('pholar:unauthorized'))
    }
    let message = `HTTP ${response.status}`
    let errorBody: unknown

    try {
      errorBody = await response.json()
      if (typeof errorBody === 'object' && errorBody !== null && 'detail' in errorBody) {
        const detail = (errorBody as { detail: unknown }).detail
        if (Array.isArray(detail)) {
          // FastAPI 422 Pydantic validation errors: [{loc, msg, type}, …]
          message = detail
            .map((e) =>
              typeof e === 'object' && e !== null && 'msg' in e
                ? String((e as { msg: unknown }).msg)
                : JSON.stringify(e),
            )
            .join('; ')
        } else {
          message = String(detail)
        }
      }
    } catch {
      // Body wasn't JSON — keep the default message.
    }

    throw new ApiError(response.status, message, errorBody)
  }

  // 204 No Content — DELETE endpoints return nothing
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
