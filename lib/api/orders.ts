import { apiClient } from './client'

// ─── Public payload / response types ─────────────────────────────────────────

export interface OrderPayload {
  customer_name: string
  customer_email: string
  shipping_address: {
    full_name: string
    address_line1: string
    address_line2?: string
    city: string
    province: string
    postal_code: string
    country: string
  }
  items: Array<{ variant_id: string; quantity: number }>
  discount_code?: string
}

export interface OrderCheckoutResponse {
  order_id: string
  checkout_url: string
  confirmation_token: string
  total_cents: number
  status: string
}

// ─── Public functions ─────────────────────────────────────────────────────────

export async function createOrder(payload: OrderPayload): Promise<OrderCheckoutResponse> {
  return apiClient<OrderCheckoutResponse>('/api/v1/orders/', {
    method: 'POST',
    body: payload,
  })
}

export interface ConfirmedOrder {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  status: string
  total_cents: number
  subtotal_cents: number
  tax_cents: number
  shipping_cents: number
  discount_cents: number
  shipping_address: {
    full_name: string
    address_line1: string
    address_line2?: string
    city: string
    province: string
    postal_code: string
    country: string
  }
  items: Array<{
    id: string
    product_name: string
    variant_label: string
    quantity: number
    unit_price_cents: number
  }>
}
export const getOrderConfirmation = (id: string, token: string) =>
  apiClient<ConfirmedOrder>(`/api/v1/orders/${encodeURIComponent(id)}`, {
    headers: { 'X-Confirmation-Token': token },
  })
