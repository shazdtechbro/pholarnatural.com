'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { getProducts } from '@/lib/api/products'
import type { CartItem, Product, ProductVariant } from '@/lib/types'
import { useHydrated } from '@/lib/use-hydrated'

import { CART_STORAGE_KEY, SERVER_CART, createGuestCartStore } from '@/lib/guest-cart'

const cartStore = createGuestCartStore(
  () => typeof window === 'undefined' ? null : window.localStorage,
  () => typeof window === 'undefined' ? null : window.sessionStorage,
)
const getServerSnapshot = () => SERVER_CART
function subscribeToCart(listener: () => void) {
  const unsubscribe = cartStore.subscribe(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY || event.key === null) cartStore.refresh()
  }
  window.addEventListener('storage', onStorage)
  cartStore.refresh()
  return () => {
    unsubscribe()
    window.removeEventListener('storage', onStorage)
  }
}

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
  storageAvailable: boolean
  startCheckout: (orderId: string) => void
  completeCheckout: (orderId: string) => void
  addItem: (product: Product, variant: ProductVariant, quantity?: number) => void
  removeItem: (key: string) => void
  setQuantity: (key: string, quantity: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function keyFor(productId: string, variantId: string) {
  return `${productId}:${variantId}`
}

export function CartProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { items, storageAvailable } = useSyncExternalStore(subscribeToCart, cartStore.getSnapshot, getServerSnapshot)
  const hydrated = useHydrated()
  const setItems = cartStore.update

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
  }, [pathname, setItems])

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
  }, [setItems])

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }, [setItems])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) =>
            i.key === key ? { ...i, quantity: Math.min(quantity, i.stock_count) } : i,
          ),
    )
  }, [setItems])

  const clear = useCallback(() => setItems([]), [setItems])

  const value = useMemo<CartContextValue>(() => {
    const subtotalCents = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0)
    return {
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotalCents,
      hydrated,
      storageAvailable,
      startCheckout: cartStore.startCheckout,
      completeCheckout: cartStore.completeCheckout,
      addItem,
      removeItem,
      setQuantity,
      clear,
    }
  }, [items, hydrated, storageAvailable, addItem, removeItem, setQuantity, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
