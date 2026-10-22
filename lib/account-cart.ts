import type { CartItem } from './types'

type Cart = { items: CartItem[]; version: number }
type Store = { getSnapshot: () => { items: CartItem[] }; update: (items: CartItem[] | ((items: CartItem[]) => CartItem[])) => void; setScope: (key: string) => void; completeCheckout: (id: string) => void }
type Request = <T>(path: string, body?: unknown, method?: string) => Promise<T>
export const INITIAL_SYNC = { owner: undefined as string | null | undefined, status: 'loading', message: '' }

/** A durable local draft and optimistic server version protect carts during outages and device conflicts. */
export function createAccountCartSync(store: Store, api: Request, storage: () => Storage | null, guestStorageKey: string) {
  let state = INITIAL_SYNC
  let owner: string | null = null
  let generation = 0
  let version = 0
  let busy = false
  let change = 0
  let pending = false
  const completed = new Set<string>()
  const listeners = new Set<() => void>()
  const emit = (status: string, message = '') => { state = { owner, status, message }; listeners.forEach((listener) => listener()) }
  const key = (kind: string) => `pholar-account-${owner}-${kind}`
  const read = (name: string) => { try { return storage()?.getItem(name) ?? null } catch { return null } }
  const write = (name: string, value: unknown) => { try { storage()?.setItem(name, JSON.stringify(value)) } catch {} }
  const remove = (name: string) => { try { storage()?.removeItem(name) } catch {} }
  const lines = (items: CartItem[]) => items.map(({ variant_id, quantity }) => ({ variant_id, quantity }))

  async function flush() {
    if (!owner || busy || !pending || state.status === 'conflict' || state.status === 'loading') return
    busy = true
    const run = generation, sequence = change, draft = store.getSnapshot().items
    emit('saving')
    try {
      const result = await api<Cart>('/cart', { items: lines(draft), version }, 'PUT')
      if (run !== generation) return
      version = result.version
      if (sequence === change) {
        pending = false; remove(key('draft')); store.update(result.items); emit('saved')
      } else write(key('draft'), { version, items: store.getSnapshot().items })
    } catch (error) {
      if (run !== generation) return
      const conflict = error instanceof Error && 'status' in error && error.status === 409
      emit(conflict ? 'conflict' : 'error', conflict ? 'Your cart changed on another device. Your edits are kept in this browser. Load the saved cart to use the other device’s changes.' : 'Your latest cart is kept in this browser. We could not save it to your account yet.')
    } finally {
      if (run === generation) { busy = false; if (pending && state.status === 'saving') void flush() }
    }
  }

  async function activate(id: string | null) {
    if (state.owner === id && state.status !== 'loading') return
    const guest = owner === null ? store.getSnapshot().items : []
    owner = id; generation++; busy = false; pending = false; change = 0
    const run = generation
    store.setScope(id ? `pholar-account-cart-${id}` : guestStorageKey)
    if (!id) { emit('guest'); completed.forEach(completeCheckout); completed.clear(); return }
    emit('loading')
    try {
      let merge = read(key('merge'))
      if (!merge && guest.length) {
        merge = JSON.stringify({ operation_id: crypto.randomUUID(), items: lines(guest) })
        write(key('merge'), JSON.parse(merge))
      }
      const result = merge ? await api<Cart>('/cart/merge', JSON.parse(merge)) : await api<Cart>('/cart')
      if (run !== generation) return
      if (merge) {
        remove(key('merge'))
        // The anonymous cart is cleared only after the merge is acknowledged.
        remove(guestStorageKey)
      }
      const draft = read(key('draft'))
      version = result.version
      if (draft) {
        const saved = JSON.parse(draft) as Cart
        store.update(saved.items); version = saved.version; pending = true
        emit(saved.version === result.version ? 'error' : 'conflict', 'Your unsaved cart edits are still in this browser. Retry saving, or load your account’s saved cart.')
      } else { store.update(result.items); emit('saved') }
      completed.forEach(completeCheckout); completed.clear()
    } catch {
      if (run === generation) emit('blocked', 'Your account cart could not load. Your browser cart is preserved. Retry before making changes.')
    }
  }

  function update(value: CartItem[] | ((items: CartItem[]) => CartItem[])) {
    if (owner && (state.status === 'loading' || state.status === 'blocked' || read(key('merge')))) return
    store.update(value)
    if (owner) {
      pending = true; change++
      write(key('draft'), { version, items: store.getSnapshot().items })
      void flush()
    }
  }

  async function reload() {
    if (!owner) return
    const run = generation
    if (read(key('merge'))) { state = { ...state, owner: undefined }; return activate(owner) }
    try {
      const cart = await api<Cart>('/cart')
      if (run !== generation) return
      version = cart.version; pending = false; remove(key('draft')); store.update(cart.items); emit('saved')
    } catch { emit('error', 'Could not load your saved cart. Please try again.') }
  }

  function completeCheckout(id: string) {
    if (state.owner === undefined || state.status === 'loading') { completed.add(id); return }
    const before = store.getSnapshot().items
    store.completeCheckout(id)
    if (before !== store.getSnapshot().items) update(store.getSnapshot().items)
  }

  return {
    activate, update, reload,
    retry: async () => { if (pending) { if (state.status !== 'conflict') { emit('error'); await flush() } } else { state = { ...state, owner: undefined }; await activate(owner) } },
    completeCheckout,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}
