/**
 * Domain types for Pholar Natural.
 *
 * Field names deliberately mirror the PostgreSQL schema in IMPLEMENTATION-DOC.md §3.1
 * (snake_case, `*_cents` for money, `is_*` for booleans). When the FastAPI backend lands in
 * week 2, `lib/data.ts` is the only file that has to change — components already speak the
 * API's language.
 */

/** Money is always integer cents, never a float. Currency is CAD everywhere (doc §7). */
export type Cents = number

export type ProductCategory = string

export interface ProductImage {
  id: string
  product_id: string
  url: string
  alt: string
  sort_order: number
}

export interface ProductVariant {
  id: string
  product_id: string
  /** Nominal weight/volume in grams or millilitres, used for sorting. */
  weight_grams: number
  /** Display label, e.g. "100ml". */
  weight_label: string
  price_cents: Cents
  stock_count: number
  sku: string
  is_active: boolean
}

export interface Product {
  seo_title?: string | null
  seo_description?: string | null
  id: string
  name: string
  slug: string
  description: string
  tagline: string
  category: ProductCategory
  is_active: boolean
  created_at: string
  updated_at: string
  /** Joined in by the API; `GET /api/products/{slug}` returns these nested. */
  images: ProductImage[]
  variants: ProductVariant[]
  /** Presentation-only flags the admin can toggle (doc §1.3.2). */
  is_bestseller?: boolean
  rating?: number
}

export interface Service {
  id: string
  name: string
  slug: string
  description: string
  /** Longer copy for the services page accordion (doc §1.5). */
  long_description: string
  what_to_expect: string[]
  duration_minutes: number
  price_cents: Cents
  image_url: string
  is_active: boolean
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export interface Booking {
  id: string
  service_id: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  /** ISO date, `YYYY-MM-DD`. */
  booking_date: string
  /** 24h `HH:mm`. */
  start_time: string
  end_time: string
  status: BookingStatus
  deposit_cents: Cents
  stripe_payment_intent_id: string | null
  cancellation_reason: string | null
  created_at: string
  /** Human-facing reference shown on the confirmation screen. */
  reference: string
}

export interface BlockedDate {
  id: string
  /** ISO date, `YYYY-MM-DD`. */
  date: string
  reason: string
  created_at: string
}

export interface ShippingAddress {
  full_name: string
  address_line1: string
  address_line2: string
  city: string
  province: string
  postal_code: string
  country: string
}

export type OrderStatus = 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

export interface OrderItem {
  id: string
  order_id: string
  product_variant_id: string
  product_name: string
  variant_label: string
  quantity: number
  unit_price_cents: Cents
  /** Denormalised for display; the API returns it alongside the item. */
  image_url: string
}

export interface Order {
  id: string
  /** Customer-facing order number, e.g. "PN-10428". */
  order_number: string
  customer_name: string
  customer_email: string
  shipping_address: ShippingAddress
  subtotal_cents: Cents
  shipping_cents: Cents
  total_cents: Cents
  status: OrderStatus
  stripe_payment_intent_id: string | null
  created_at: string
  items: OrderItem[]
}

export type DiscountType = 'percentage' | 'fixed'

export interface Discount {
  id: string
  code: string
  discount_type: DiscountType
  /** Percent (0-100) when `percentage`, cents when `fixed`. */
  value: number
  max_uses: number
  used_count: number
  min_order_cents: Cents
  /** ISO datetime. */
  expires_at: string
  is_active: boolean
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string
  message: string
  is_read: boolean
  created_at: string
}

/** `admin_settings` is a key/value table; this is the typed view of it. */
export interface AdminSettings {
  whatsapp_enabled: boolean
  whatsapp_number: string
  email_notifications_enabled: boolean
  business_hours_start: string
  business_hours_end: string
}

/** A line in the cart. Client-side only — never persisted server-side (guest checkout, doc §1.8). */
export interface CartItem {
  /** `${product_id}:${variant_id}` — the stable identity of a cart line. */
  key: string
  product_id: string
  product_slug: string
  product_name: string
  variant_id: string
  variant_label: string
  unit_price_cents: Cents
  quantity: number
  image_url: string
  image_alt: string
  /** Snapshot of stock at add-time, used to cap the quantity stepper. */
  stock_count: number
}
