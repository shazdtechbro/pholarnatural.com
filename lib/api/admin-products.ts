import { apiClient } from './client'

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').replace(/\/$/, '')

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface AdminProductImage {
  id: string
  url: string
  alt: string | null
  sort_order: number
}

export interface AdminProductVariant {
  id: string
  weight_grams: number | null
  weight_label: string | null
  price_cents: number
  stock_count: number
  sku: string | null
  is_active: boolean
}

export interface AdminProduct {
  seo_title?: string | null
  seo_description?: string | null
  is_bestseller?: boolean
  id: string
  name: string
  slug: string
  tagline: string | null
  description: string | null
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
  images: AdminProductImage[]
  variants: AdminProductVariant[]
}

// ─── Request payloads ─────────────────────────────────────────────────────────

export interface ProductCreatePayload {
  seo_title?: string | null
  seo_description?: string | null
  is_bestseller?: boolean
  name: string
  tagline?: string
  description?: string
  category?: string
  is_active?: boolean
  variants?: VariantPayload[]
}

export interface ProductUpdatePayload {
  seo_title?: string | null
  seo_description?: string | null
  is_bestseller?: boolean
  name?: string
  slug?: string
  tagline?: string
  description?: string
  category?: string
  is_active?: boolean
}

export interface VariantPayload {
  weight_grams?: number | null
  weight_label?: string | null
  price_cents: number
  stock_count?: number
  sku?: string | null
  is_active?: boolean
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

export function listAdminProducts(): Promise<AdminProduct[]> {
  return apiClient<AdminProduct[]>('/api/v1/admin/products/', { auth: true })
}

export function createAdminProduct(data: ProductCreatePayload): Promise<AdminProduct> {
  return apiClient<AdminProduct>('/api/v1/admin/products/', {
    method: 'POST',
    body: data,
    auth: true,
  })
}

export function updateAdminProduct(id: string, data: ProductUpdatePayload): Promise<AdminProduct> {
  return apiClient<AdminProduct>(`/api/v1/admin/products/${id}`, {
    method: 'PUT',
    body: data,
    auth: true,
  })
}

export function deleteAdminProduct(id: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/products/${id}`, { method: 'DELETE', auth: true })
}

// ─── Variants ─────────────────────────────────────────────────────────────────

export function addVariant(productId: string, data: VariantPayload): Promise<AdminProductVariant> {
  return apiClient<AdminProductVariant>(`/api/v1/admin/products/${productId}/variants`, {
    method: 'POST',
    body: data,
    auth: true,
  })
}

export function updateVariant(id: string, data: VariantPayload): Promise<AdminProductVariant> {
  return apiClient<AdminProductVariant>(`/api/v1/admin/variants/${id}`, {
    method: 'PUT',
    body: data,
    auth: true,
  })
}

export function deleteVariant(id: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/variants/${id}`, { method: 'DELETE', auth: true })
}

// ─── Images (multipart — cannot use apiClient) ────────────────────────────────

export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<AdminProductImage> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('pholar_admin_token') : null

  const form = new FormData()
  form.append('file', file)

  const res = await fetch(`${BASE}/api/v1/admin/products/${productId}/images`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`)
  }

  return res.json() as Promise<AdminProductImage>
}

export function deleteProductImage(productId: string, imageId: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/products/${productId}/images/${imageId}`, {
    method: 'DELETE',
    auth: true,
  })
}

export const reorderProductImages = (productId: string, imageIds: string[]) =>
  apiClient(`/api/v1/admin/products/${productId}/images/order`, {
    method: 'PUT',
    auth: true,
    body: imageIds,
  })
