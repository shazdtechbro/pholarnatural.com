import assert from 'node:assert/strict'
import test from 'node:test'
import { CART_STORAGE_KEY, createGuestCartStore } from '../lib/guest-cart.ts'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}
const line = {
  key: 'will-be-normalised', product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: '22222222-2222-4222-8222-222222222222', product_slug: 'oil',
  product_name: 'Hair Oil', variant_label: '100ml', unit_price_cents: 3299,
  quantity: 1, stock_count: 10, image_url: '', image_alt: 'Hair Oil',
}

test('add is persisted before observers are notified; refresh and reopening restore it', () => {
  const storage = memoryStorage()
  const store = createGuestCartStore(() => storage)
  store.getSnapshot()
  store.subscribe(() => assert.equal(JSON.parse(storage.getItem(CART_STORAGE_KEY))[0].quantity, 1))
  store.update([line])
  const reopened = createGuestCartStore(() => storage)
  assert.equal(reopened.getSnapshot().items[0].quantity, 1)
  assert.equal(reopened.getSnapshot().items[0].key, `${line.product_id}:${line.variant_id}`)
})

test('another tab can refresh both quantity changes and cart removal without writing back', () => {
  const storage = memoryStorage()
  const first = createGuestCartStore(() => storage)
  const second = createGuestCartStore(() => storage)
  second.getSnapshot()
  first.update([line])
  second.refresh()
  assert.equal(second.getSnapshot().items.length, 1)
  first.update([{ ...line, quantity: 3 }])
  second.refresh()
  assert.equal(second.getSnapshot().items[0].quantity, 3)
  storage.removeItem(CART_STORAGE_KEY)
  second.refresh()
  assert.equal(second.getSnapshot().items.length, 0)
})

test('blocked browser storage keeps an in-memory cart and reports the limitation', () => {
  const store = createGuestCartStore(() => { throw new Error('blocked') })
  store.update([line])
  assert.equal(store.getSnapshot().items.length, 1)
  assert.equal(store.getSnapshot().storageAvailable, false)
})

test('full storage does not erase the current cart on the next refresh event', () => {
  const storage = memoryStorage()
  storage.setItem(CART_STORAGE_KEY, JSON.stringify([line]))
  const store = createGuestCartStore(() => ({ ...storage, setItem() { throw new Error('quota') } }))
  store.update((items) => items.map((item) => ({ ...item, quantity: 2 })))
  store.refresh()
  assert.equal(store.getSnapshot().items[0].quantity, 2)
  assert.equal(store.getSnapshot().storageAvailable, false)
})

test('malformed saved lines cannot crash the cart or create invalid quantities', () => {
  const storage = memoryStorage()
  storage.setItem(CART_STORAGE_KEY, JSON.stringify([null, { ...line, quantity: -1 }, { ...line, product_name: null }, line, line]))
  const store = createGuestCartStore(() => storage)
  assert.equal(store.getSnapshot().items.length, 1)
})

test('failed or cancelled checkout retains the guest cart', () => {
  const store = createGuestCartStore(() => memoryStorage())
  store.update([line])
  store.startCheckout('cancelled-order')
  assert.equal(store.getSnapshot().items.length, 1)
})

test('verified checkout removes only purchased units once, including after a refresh', () => {
  const storage = memoryStorage(), session = memoryStorage()
  const store = createGuestCartStore(() => storage, () => session)
  store.update([line])
  store.startCheckout('paid-order')
  store.update([{ ...line, quantity: 3 }])
  const returned = createGuestCartStore(() => storage, () => session)
  returned.completeCheckout('paid-order')
  assert.equal(returned.getSnapshot().items[0].quantity, 2)
  returned.completeCheckout('paid-order')
  assert.equal(returned.getSnapshot().items[0].quantity, 2)
})

test('an old receipt or receipt from another device never clears the active cart', () => {
  const store = createGuestCartStore(() => memoryStorage())
  store.update([line])
  store.completeCheckout('unrelated-order')
  assert.equal(store.getSnapshot().items.length, 1)
})
