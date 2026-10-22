import assert from 'node:assert/strict'
import test from 'node:test'
import { createGuestCartStore, CART_STORAGE_KEY } from '../lib/guest-cart.ts'
import { createAccountCartSync } from '../lib/account-cart.ts'

const line = { key: '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222', product_id: '11111111-1111-4111-8111-111111111111', variant_id: '22222222-2222-4222-8222-222222222222', product_name: 'Oil', product_slug: 'oil', variant_label: '100ml', unit_price_cents: 2000, quantity: 1, stock_count: 50, image_url: '', image_alt: 'Oil' }
function setup(api, values = new Map()) {
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const store = createGuestCartStore(() => storage, () => storage)
  const sync = createAccountCartSync(store, api, () => storage, CART_STORAGE_KEY)
  return { storage, store, sync, values }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('sign-in merges guest cart once; failed acknowledgement retries the same operation', async () => {
  const calls = []
  let first = true
  const { store, sync, storage } = setup(async (path, body) => {
    calls.push(body)
    assert.equal(path, '/cart/merge')
    if (first) { first = false; throw new Error('offline') }
    return { version: 1, items: [{ ...line, quantity: 3 }] }
  })
  store.update([line])
  await sync.activate('customer-a')
  assert.equal(sync.getSnapshot().status, 'blocked')
  assert.ok(storage.getItem(CART_STORAGE_KEY))
  await sync.retry()
  assert.equal(calls[0].operation_id, calls[1].operation_id)
  assert.equal(store.getSnapshot().items[0].quantity, 3)
  assert.equal(storage.getItem(CART_STORAGE_KEY), null)
})

test('rapid edits are serialized and the last edit survives an earlier response', async () => {
  let resolve
  const calls = []
  const { sync, store } = setup(async (path, body) => {
    if (!body) return { version: 0, items: [line] }
    calls.push(body)
    if (calls.length === 1) return new Promise((done) => { resolve = done })
    return { version: 2, items: [{ ...line, quantity: body.items[0].quantity }] }
  })
  await sync.activate('customer-a')
  sync.update([{ ...line, quantity: 2 }])
  sync.update([{ ...line, quantity: 4 }])
  resolve({ version: 1, items: [{ ...line, quantity: 2 }] })
  await tick()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].version, 1)
  assert.equal(store.getSnapshot().items[0].quantity, 4)
  assert.equal(sync.getSnapshot().status, 'saved')
})

test('offline drafts survive refresh and retry without overwriting another device', async () => {
  const values = new Map()
  const one = setup(async (_, body) => { if (body) throw new Error('offline'); return { version: 3, items: [line] } }, values)
  await one.sync.activate('customer-a')
  one.sync.update([{ ...line, quantity: 5 }]); await tick()
  assert.equal(one.sync.getSnapshot().status, 'error')
  let writes = 0
  const two = setup(async (_, body) => { if (body) writes++; return { version: 4, items: [{ ...line, quantity: 2 }] } }, values)
  await two.sync.activate('customer-a')
  assert.equal(two.store.getSnapshot().items[0].quantity, 5)
  assert.equal(two.sync.getSnapshot().status, 'conflict')
  await two.sync.retry(); assert.equal(writes, 0)
  await two.sync.reload()
  assert.equal(two.store.getSnapshot().items[0].quantity, 2)
})

test('signing out and switching accounts does not expose or merge the previous customer cart', async () => {
  let calls = 0
  const { sync, store } = setup(async () => ({ version: 0, items: ++calls === 1 ? [line] : [] }))
  await sync.activate('customer-a')
  assert.equal(store.getSnapshot().items.length, 1)
  await sync.activate(null)
  assert.equal(store.getSnapshot().items.length, 0)
  await sync.activate('customer-b')
  assert.equal(store.getSnapshot().items.length, 0)
  assert.equal(calls, 2)
})

test('payment return waits for the account cart before removing the purchased units', async () => {
  const values = new Map()
  const first = setup(async () => ({ version: 1, items: [line] }), values)
  await first.sync.activate('customer-a')
  first.store.startCheckout('order-a')
  const second = setup(async (_, body) => ({ version: body ? 2 : 1, items: body ? [] : [line] }), values)
  second.sync.completeCheckout('order-a')
  await second.sync.activate('customer-a'); await tick()
  assert.equal(second.store.getSnapshot().items.length, 0)
  assert.equal(second.sync.getSnapshot().status, 'saved')
})
