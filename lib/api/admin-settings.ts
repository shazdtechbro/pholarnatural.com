import { apiClient } from './client'

export interface WhatsAppStatus {
  connected: boolean
  state: string
  /** Linked phone number (e.g. "14165550142") — present when state is "open" on some Evolution API versions. */
  phone?: string | null
}

export interface WhatsAppQR {
  /** Full data URI: "data:image/png;base64,..." — pass directly to <img src>. */
  base64: string | null
  /** Raw QR string, not needed for display. */
  code: string | null
  error?: string
}

export interface AdminSettingsData {
  email_notifications_enabled: boolean
  free_shipping_threshold_cents: number
  notifier_whatsapp_number: string
  low_stock_threshold: number
  notify_new_order: boolean
  notify_new_booking: boolean
  notify_booking_cancelled: boolean
  notify_payment_failed: boolean
  notify_new_contact_message: boolean
  notify_low_stock: boolean
  notify_discount_maxed_out: boolean
  // Shipping & tax
  shipping_rate_domestic_cents: number
  shipping_rate_us_cents: number
  shipping_rate_uk_cents: number
  shipping_rate_international_cents: number
  tax_rate_percent: number
  // Social
  instagram_url: string
  facebook_url: string
  tiktok_url: string
  // Homepage content
  featured_product_ids: string
  featured_service_ids: string
  hero_image_url: string
  featured_image_url: string
}

/** Matches _DEFAULT_ON in server/app/services/whatsapp.py. */
const BOOL_DEFAULTS: Record<string, boolean> = {
  notify_new_order: true,
  notify_new_booking: true,
  notify_booking_cancelled: true,
  notify_payment_failed: true,
  notify_new_contact_message: true,
  notify_low_stock: true,
  notify_discount_maxed_out: false,
}

function parseBool(raw: string | undefined, key: string): boolean {
  if (raw === undefined) return BOOL_DEFAULTS[key] ?? false
  return raw === 'true'
}

export async function loadAdminSettings(): Promise<AdminSettingsData> {
  const raw = await apiClient<Record<string, string>>('/api/v1/admin/settings', { auth: true })
  return {
    email_notifications_enabled: raw.email_notifications_enabled !== 'false',
    free_shipping_threshold_cents: Number(raw.free_shipping_threshold_cents ?? '5000'),
    notifier_whatsapp_number: raw.notifier_whatsapp_number ?? '',
    low_stock_threshold: Number(raw.low_stock_threshold ?? '5'),
    notify_new_order: parseBool(raw.notify_new_order, 'notify_new_order'),
    notify_new_booking: parseBool(raw.notify_new_booking, 'notify_new_booking'),
    notify_booking_cancelled: parseBool(raw.notify_booking_cancelled, 'notify_booking_cancelled'),
    notify_payment_failed: parseBool(raw.notify_payment_failed, 'notify_payment_failed'),
    notify_new_contact_message: parseBool(
      raw.notify_new_contact_message,
      'notify_new_contact_message',
    ),
    notify_low_stock: parseBool(raw.notify_low_stock, 'notify_low_stock'),
    notify_discount_maxed_out: parseBool(
      raw.notify_discount_maxed_out,
      'notify_discount_maxed_out',
    ),
    shipping_rate_domestic_cents: Number(raw.shipping_rate_domestic_cents ?? '995'),
    shipping_rate_us_cents: Number(raw.shipping_rate_us_cents ?? '1499'),
    shipping_rate_uk_cents: Number(raw.shipping_rate_uk_cents ?? '1999'),
    shipping_rate_international_cents: Number(raw.shipping_rate_international_cents ?? '2499'),
    tax_rate_percent: Number(raw.tax_rate_percent ?? '13'),
    instagram_url: raw.instagram_url ?? '',
    facebook_url: raw.facebook_url ?? '',
    tiktok_url: raw.tiktok_url ?? '',
    featured_product_ids: raw.featured_product_ids ?? '',
    featured_service_ids: raw.featured_service_ids ?? '',
    hero_image_url: raw.hero_image_url ?? '',
    featured_image_url: raw.featured_image_url ?? '',
  }
}

export async function saveAdminSettings(data: AdminSettingsData): Promise<void> {
  const payload: Record<string, string> = {
    email_notifications_enabled: String(data.email_notifications_enabled),
    free_shipping_threshold_cents: String(data.free_shipping_threshold_cents),
    notifier_whatsapp_number: data.notifier_whatsapp_number,
    low_stock_threshold: String(data.low_stock_threshold),
    notify_new_order: String(data.notify_new_order),
    notify_new_booking: String(data.notify_new_booking),
    notify_booking_cancelled: String(data.notify_booking_cancelled),
    notify_payment_failed: String(data.notify_payment_failed),
    notify_new_contact_message: String(data.notify_new_contact_message),
    notify_low_stock: String(data.notify_low_stock),
    notify_discount_maxed_out: String(data.notify_discount_maxed_out),
    shipping_rate_domestic_cents: String(data.shipping_rate_domestic_cents),
    shipping_rate_us_cents: String(data.shipping_rate_us_cents),
    shipping_rate_uk_cents: String(data.shipping_rate_uk_cents),
    shipping_rate_international_cents: String(data.shipping_rate_international_cents),
    tax_rate_percent: String(data.tax_rate_percent),
    instagram_url: data.instagram_url,
    facebook_url: data.facebook_url,
    tiktok_url: data.tiktok_url,
    featured_product_ids: data.featured_product_ids,
    featured_service_ids: data.featured_service_ids,
    hero_image_url: data.hero_image_url,
    featured_image_url: data.featured_image_url,
  }
  await apiClient('/api/v1/admin/settings', { method: 'PUT', body: payload, auth: true })
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com'

export async function uploadSettingsImage(file: File): Promise<string> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('pholar_admin_token') : null
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/v1/admin/settings/upload-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`)
  }
  const { url } = await res.json()
  return url
}

export function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return apiClient<WhatsAppStatus>('/api/v1/admin/whatsapp/status', { auth: true })
}

export function getWhatsAppQR(): Promise<WhatsAppQR> {
  return apiClient<WhatsAppQR>('/api/v1/admin/whatsapp/qr', { auth: true })
}

export function logoutWhatsApp(): Promise<void> {
  return apiClient<void>('/api/v1/admin/whatsapp/logout', { method: 'POST', auth: true })
}

export function sendTestWhatsApp(): Promise<void> {
  return apiClient<void>('/api/v1/admin/whatsapp/test', { method: 'POST', auth: true })
}
