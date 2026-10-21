'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { formatPrice } from '@/lib/format'
import { CURRENCY } from '@/lib/config'

/**
 * Cart (doc §1.7).
 *
 * Rendering is gated on `hydrated` because the cart lives in localStorage: the server has no
 * way to know what is in it, so drawing the empty state before the browser has read storage
 * would flash "your cart is empty" at someone who has items.
 */
export default function CartPage() {
  const { items, subtotalCents, hydrated, storageAvailable, setQuantity, removeItem } = useCart()
  const { toast } = useToast()
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-16">
        <h1 className="mb-10 font-headline-display text-headline-lg-mobile text-primary md:text-headline-lg">
          Your Cart
        </h1>
        <div className="space-y-4" aria-busy="true" aria-label="Loading your cart">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-container-low" />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center md:px-16">
        <ShoppingBag className="mx-auto mb-6 h-14 w-14 text-outline" aria-hidden="true" />
        <h1 className="mb-3 font-headline-display text-headline-lg-mobile text-primary md:text-headline-lg">
          Your cart is empty
        </h1>
        <p className="mb-8 font-body-lg text-body-lg text-on-surface-variant">
          Nothing here yet. Browse the collection and find your ritual.
        </p>
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
        >
          Continue Shopping
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-16">
      <h1 className="mb-2 font-headline-display text-headline-lg-mobile text-primary md:text-headline-lg">
        Your Cart
      </h1>
      <p className="mb-10 font-body-md text-body-md text-on-surface-variant">
        {items.length} {items.length === 1 ? 'line' : 'lines'} · All prices in {CURRENCY}
      </p>

      <p className="mb-8 font-body-md text-body-md text-on-surface-variant" role="status">
        {storageAvailable
          ? 'Your cart is saved in this browser. Come back anytime. No account needed.'
          : 'Your browser is blocking cart storage. Keep this tab open until you finish checkout.'}
      </p>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        <ul className="space-y-4">
          {items.map((item) => {
            const lineTotal = item.unit_price_cents * item.quantity
            const confirming = confirmingKey === item.key
            return (
              <li
                key={item.key}
                className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row"
              >
                <Link
                  href={`/shop/${item.product_slug}`}
                  className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-surface-container-low"
                >
                  {item.image_url && (
                    <Image src={item.image_url} alt={item.image_alt} fill sizes="112px" className="object-cover" />
                  )}
                </Link>

                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-headline-md text-body-lg text-on-surface">
                        <Link href={`/shop/${item.product_slug}`} className="hover:text-primary">
                          {item.product_name}
                        </Link>
                      </h2>
                      <p className="font-body-md text-[13px] text-on-surface-variant">
                        Size: {item.variant_label} · {formatPrice(item.unit_price_cents)} each
                      </p>
                    </div>
                    <p className="whitespace-nowrap font-body-md text-body-md font-bold text-primary">
                      {formatPrice(lineTotal)}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(item.key, item.quantity - 1)}
                        aria-label={`Decrease quantity of ${item.product_name} ${item.variant_label}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-primary transition-colors hover:bg-surface-container-high"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span
                        className="w-10 text-center font-body-md text-body-md"
                        aria-label={`Quantity: ${item.quantity}`}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(item.key, item.quantity + 1)}
                        disabled={item.quantity >= item.stock_count}
                        aria-label={`Increase quantity of ${item.product_name} ${item.variant_label}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-primary transition-colors hover:bg-surface-container-high disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {item.quantity >= item.stock_count && (
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Max stock</span>
                      )}
                    </div>

                    {/* Remove asks for confirmation inline rather than in a modal (doc §1.7). */}
                    {confirming ? (
                      <div className="flex items-center gap-2">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Remove?</span>
                        <button
                          type="button"
                          onClick={() => {
                            removeItem(item.key)
                            setConfirmingKey(null)
                            toast(`${item.product_name} removed from your cart`, 'info')
                          }}
                          className="rounded-full bg-error px-4 py-1.5 font-label-sm text-label-sm text-on-error"
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingKey(null)}
                          className="rounded-full border border-outline px-4 py-1.5 font-label-sm text-label-sm text-on-surface-variant"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingKey(item.key)}
                        aria-label={`Remove ${item.product_name} ${item.variant_label} from cart`}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Summary */}
        <aside className="h-fit rounded-2xl border border-outline-variant bg-surface-container-low p-6 lg:sticky lg:top-28">
          <h2 className="mb-6 font-headline-md text-headline-md text-primary">Order Summary</h2>

          <dl className="space-y-3" aria-live="polite">
            <div className="flex justify-between font-body-md text-body-md">
              <dt className="text-on-surface-variant">Subtotal</dt>
              <dd className="font-semibold text-on-surface">{formatPrice(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-outline-variant pt-3 font-headline-md text-headline-md">
              <dt className="text-primary">Subtotal</dt>
              <dd className="text-primary">{formatPrice(subtotalCents)}</dd>
            </div>
          </dl>

          <p className="mt-4 font-body-md text-[12px] text-on-surface-variant">
            Shipping and taxes calculated at checkout.
          </p>

          <Link
            href="/checkout"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
          >
            Checkout as Guest
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <Link
            href="/shop"
            className="mt-3 block w-full rounded-full border border-outline py-3 text-center font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            Continue Shopping
          </Link>

          <p className="mt-4 text-center font-body-md text-[12px] text-on-surface-variant">
            All prices in {CURRENCY}. Taxes calculated at checkout.
          </p>
        </aside>
      </div>
    </div>
  )
}
