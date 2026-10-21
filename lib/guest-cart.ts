import type { CartItem } from './types'

export const CART_STORAGE_KEY = 'pholar-cart-v1'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
type CheckoutLine = Pick<CartItem, 'variant_id' | 'quantity'>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseCart(raw: string | null): CartItem[] {
  try {
    const values: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(values)) return []
    const seen = new Set<string>()
    return values.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const line = item as CartItem
      if (
        !UUID.test(line.product_id) || !UUID.test(line.variant_id) ||
        !['product_slug', 'product_name', 'variant_label', 'image_url', 'image_alt'].every(
          (key) => typeof line[key as keyof CartItem] === 'string',
        ) ||
        !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
        !Number.isSafeInteger(line.unit_price_cents) || line.unit_price_cents < 0 ||
        !Number.isSafeInteger(line.stock_count) || line.stock_count < 0
      ) return []
      const key = `${line.product_id}:${line.variant_id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ ...line, key, quantity: Math.min(line.quantity, 100) }]
    })
  } catch {
    return []
  }
}

export const SERVER_CART = { items: [] as CartItem[], storageAvailable: true }

/** Anonymous browser cart. Writes happen with the action, before a refresh can interrupt it. */
export function createGuestCartStore(storage: StorageAccess, checkoutStorage: StorageAccess = () => null) {
  let snapshot = SERVER_CART
  let initialized = false
  let lastRaw: string | null = null
  const listeners = new Set<() => void>()
  const checkouts = new Map<string, CheckoutLine[]>()
  const emit = () => listeners.forEach((listener) => listener())

  function refresh() {
    try {
      const target = storage()
      if (!target) throw new Error('Storage unavailable')
      const raw = target.getItem(CART_STORAGE_KEY)
      if (!initialized || raw !== lastRaw) {
        lastRaw = raw
        snapshot = { items: parseCart(raw), storageAvailable: true }
        initialized = true
        emit()
      }
    } catch {
      if (!initialized || snapshot.storageAvailable) {
        snapshot = { ...snapshot, storageAvailable: false }
        initialized = true
        emit()
      }
    }
  }

  function getSnapshot() {
    if (!initialized) refresh()
    return snapshot
  }

  function update(change: CartItem[] | ((items: CartItem[]) => CartItem[])) {
    const previous = getSnapshot().items
    const items = typeof change === 'function' ? change(previous) : change
    let storageAvailable = false
    try {
      const target = storage()
      if (!target) throw new Error('Storage unavailable')
      const raw = JSON.stringify(items)
      target.setItem(CART_STORAGE_KEY, raw)
      lastRaw = raw
      storageAvailable = true
    } catch {
      // Keep the cart usable in this tab if storage is blocked or full.
    }
    snapshot = { items, storageAvailable }
    emit()
  }

  function startCheckout(id: string) {
    const lines = getSnapshot().items.map(({ variant_id, quantity }) => ({ variant_id, quantity }))
    checkouts.set(id, lines)
    try { checkoutStorage()?.setItem(`pholar-checkout-${id}`, JSON.stringify(lines)) } catch {}
  }

  function completeCheckout(id: string) {
    let lines = checkouts.get(id)
    if (!lines) {
      try {
        const raw: unknown = JSON.parse(checkoutStorage()?.getItem(`pholar-checkout-${id}`) ?? 'null')
        if (Array.isArray(raw) && raw.every((line) => line && UUID.test(line.variant_id) && Number.isSafeInteger(line.quantity) && line.quantity > 0)) lines = raw
      } catch {}
    }
    // An old email receipt or a checkout from another device must not erase a new cart.
    if (!lines) return
    checkouts.delete(id)
    try { checkoutStorage()?.removeItem(`pholar-checkout-${id}`) } catch {}
    const purchased = new Map(lines.map((line) => [line.variant_id, line.quantity]))
    update((items) => items.flatMap((item) => {
      const quantity = item.quantity - (purchased.get(item.variant_id) ?? 0)
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  return {
    getSnapshot, refresh, update, startCheckout, completeCheckout,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
