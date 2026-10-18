'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { getProducts } from '@/lib/api/products'
import type { CartItem, Product, ProductVariant } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

const STORAGE_KEY = 'pholar-cart-v1'

interface CartContextValue {
  items: CartItem[]
  /** Total number of units, for the navbar badge. */
  count: number
  subtotalCents: number
  /**
   * True once localStorage has been read. Components must gate cart-dependent UI on this to
   * avoid a hydration mismatch — the server renders an empty cart, the browser may not have one.
   */
  hydrated: boolean
  addItem: (product: Product, variant: ProductVariant, quantity?: number) => void
  removeItem: (key: string) => void
  setQuantity: (key: string, quantity: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function keyFor(productId: string, variantId: string) {
  return `${productId}:${variantId}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Discards anything that does not look like a CartItem, so a stale or hand-edited key cannot crash the app. */
function parseStored(raw: string | null): CartItem[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (i): i is CartItem =>
        !!i &&
        typeof i === 'object' &&
        typeof (i as CartItem).key === 'string' &&
        typeof (i as CartItem).variant_id === 'string' &&
        // Pre-API static data used slugs like "var_oil_30"; the backend requires real UUIDs.
        UUID_RE.test((i as CartItem).variant_id) &&
        typeof (i as CartItem).unit_price_cents === 'number' &&
        typeof (i as CartItem).quantity === 'number' &&
        (i as CartItem).quantity > 0,
    )
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  /*
   * Seeded lazily from localStorage on the first client render. On the server `window` is
   * undefined and this starts empty, which is what the server HTML reflects.
   *
   * Consumers gate cart-dependent UI on `hydrated`, which is still false during the hydration
   * render — so the hydration output matches the server even though `items` is already
   * populated. That is what makes reading storage here safe instead of in an effect.
   */
  const [items, setItems] = useState<CartItem[]>(() =>
    typeof window === 'undefined' ? [] : parseStored(window.localStorage.getItem(STORAGE_KEY)),
  )
  const hydrated = useHydrated()

  // Persist on every change. Guarded on `hydrated` so the server-render pass never writes.
  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items, hydrated])

  // Keep tabs in sync: a cart edited in one tab should not be silently overwritten by another.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(parseStored(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    let stopped = false
    async function sync() {
      try {
        const products = await getProducts()
        if (stopped) return
        const variants = new Map(
          products.flatMap((product) =>
            product.variants.map((variant) => [variant.id, { product, variant }] as const),
          ),
        )
        setItems((previous) =>
          previous.flatMap((item) => {
            const current = variants.get(item.variant_id)
            if (!current || current.variant.stock_count <= 0) return []
            const { product, variant } = current
            return [
              {
                ...item,
                product_name: product.name,
                product_slug: product.slug,
                variant_label: variant.weight_label,
                unit_price_cents: variant.price_cents,
                stock_count: variant.stock_count,
                quantity: Math.min(item.quantity, variant.stock_count),
                image_url: product.images[0]?.url ?? '',
                image_alt: product.images[0]?.alt ?? product.name,
              },
            ]
          }),
        )
      } catch {
        /* Keep the saved cart during a temporary API outage. */
      }
    }
    void sync()
    window.addEventListener('focus', sync)
    return () => {
      stopped = true
      window.removeEventListener('focus', sync)
    }
  }, [pathname])

  const addItem = useCallback((product: Product, variant: ProductVariant, quantity = 1) => {
    if (!variant.is_active || variant.stock_count <= 0 || variant.price_cents <= 0) return
    setItems((prev) => {
      const key = keyFor(product.id, variant.id)
      const existing = prev.find((i) => i.key === key)
      if (existing) {
        return prev.map((i) =>
          i.key === key
            ? { ...i, quantity: Math.min(i.quantity + quantity, variant.stock_count) }
            : i,
        )
      }
      const image = product.images[0]
      return [
        ...prev,
        {
          key,
          product_id: product.id,
          product_slug: product.slug,
          product_name: product.name,
          variant_id: variant.id,
          variant_label: variant.weight_label,
          unit_price_cents: variant.price_cents,
          quantity: Math.min(quantity, variant.stock_count),
          image_url: image?.url ?? '',
          image_alt: image?.alt ?? product.name,
          stock_count: variant.stock_count,
        },
      ]
    })
  }, [])

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) =>
            i.key === key ? { ...i, quantity: Math.min(quantity, i.stock_count) } : i,
          ),
    )
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartContextValue>(() => {
    const subtotalCents = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0)
    return {
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotalCents,
      hydrated,
      addItem,
      removeItem,
      setQuantity,
      clear,
    }
  }, [items, hydrated, addItem, removeItem, setQuantity, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
