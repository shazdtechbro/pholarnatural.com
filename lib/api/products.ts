import type { Product } from '@/lib/types'
import { apiClient, ApiError } from './client'

// ─── Raw backend shapes ───────────────────────────────────────────────────────
// Kept local — components only ever see the normalised Product type.

interface RawImage {
  id: string
  url: string
  alt?: string | null
  sort_order?: number | null
}

interface RawVariant {
  id: string
  weight_grams?: number | null
  weight_label?: string | null
  price_cents: number
  stock_count: number
  sku?: string | null
  is_active: boolean
}

interface RawProduct {
  seo_title?: string | null
  seo_description?: string | null
  is_bestseller?: boolean
  id: string
  name: string
  slug: string
  description?: string | null
  tagline?: string | null
  category?: string | null
  is_active: boolean
  created_at: string
  updated_at?: string | null
  images: RawImage[]
  variants: RawVariant[]
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalise(raw: RawProduct): Product {
  return {
    ...raw,
    description: raw.description ?? '',
    tagline: raw.tagline ?? '',
    category: (raw.category ?? 'Hair Oil') as Product['category'],
    updated_at: raw.updated_at ?? raw.created_at,
    images: (raw.images.length
      ? raw.images
      : [{ id: 'placeholder', url: '/images/hero/woman-braids.webp', alt: raw.name, sort_order: 0 }]
    )
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((img) => ({
        id: img.id,
        product_id: raw.id, // backend omits product_id on the image object
        url: img.url,
        alt: img.alt ?? '',
        sort_order: img.sort_order ?? 0,
      })),
    variants: raw.variants
      .filter((v) => v.is_active)
      .map((v) => ({
        id: v.id,
        product_id: raw.id,
        weight_grams: v.weight_grams ?? 0,
        weight_label: v.weight_label ?? '',
        price_cents: v.price_cents,
        stock_count: v.stock_count,
        sku: v.sku ?? '',
        is_active: v.is_active,
      })),
  }
}

// ─── Public functions ─────────────────────────────────────────────────────────

export async function getProducts(opts?: { category?: string; q?: string }): Promise<Product[]> {
  const params = new URLSearchParams()
  if (opts?.category && opts.category !== 'All Products') {
    params.set('category', opts.category)
  }
  if (opts?.q) {
    params.set('q', opts.q)
  }

  const qs = params.toString()
  const raw = await apiClient<RawProduct[]>(`/api/v1/products/${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 300 },
  })
  return raw.map(normalise)
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const raw = await apiClient<RawProduct>(`/api/v1/products/${slug}`, {})
    return normalise(raw)
  } catch (e) {
    if (e instanceof ApiError && e.isNotFound) return null
    throw e
  }
}

/** Used by generateStaticParams — fetches the full list and extracts slugs. */
export async function getProductSlugs(): Promise<string[]> {
  const products = await getProducts()
  return products.map((p) => p.slug)
}
