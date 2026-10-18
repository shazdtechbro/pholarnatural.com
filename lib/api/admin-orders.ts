import { apiClient } from './client'

export interface AdminOrderItem {
  id: string
  product_name: string
  variant_label: string | null
  quantity: number
  unit_price_cents: number
}

export interface AdminOrderShippingAddress {
  full_name: string
  address_line1: string
  address_line2?: string | null
  city: string
  province: string
  postal_code: string
  country: string
}

export interface AdminOrder {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  shipping_address: AdminOrderShippingAddress
  subtotal_cents: number
  shipping_cents: number
  discount_cents: number
  tax_cents: number
  total_cents: number
  status: string
  created_at: string
  items: AdminOrderItem[]
}

export function listAdminOrders(status?: string): Promise<AdminOrder[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiClient<AdminOrder[]>(`/api/v1/admin/orders/${qs}`, { auth: true })
}

export function getAdminOrder(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/api/v1/admin/orders/${id}`, { auth: true })
}

export function updateOrderStatus(id: string, status: string): Promise<{ status: string }> {
  return apiClient<{ status: string }>(`/api/v1/admin/orders/${id}/status`, {
    method: 'PUT',
    body: { status },
    auth: true,
  })
}
