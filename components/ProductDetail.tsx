'use client'

import Image from 'next/image'
import { useId, useState } from 'react'
import { Minus, Plus, ShoppingCart, Check, TriangleAlert, CircleX } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { formatPrice } from '@/lib/format'
import type { Product } from '@/lib/types'

/** Below this many units we warn rather than simply saying "in stock" (doc §1.4). */
const LOW_STOCK_THRESHOLD = 5

/** Gallery, variant selector, stock indicator, quantity stepper and Add to Cart (doc §1.4). */
function PurchasableDetail({
  product,
  lowStockThreshold,
}: {
  product: Product
  lowStockThreshold: number
}) {
  const activeVariants = product.variants.filter((v) => v.is_active)
  const firstInStock = activeVariants.find((v) => v.stock_count > 0) ?? activeVariants[0]

  const [variantId, setVariantId] = useState(firstInStock.id)
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)

  const variant = activeVariants.find((v) => v.id === variantId) ?? firstInStock
  const { addItem, canEdit } = useCart()
  const { toast } = useToast()
  const groupId = useId()
  const qtyId = useId()

  const outOfStock = variant.stock_count <= 0 || variant.price_cents <= 0
  const lowStock = !outOfStock && variant.stock_count <= lowStockThreshold
  const maxQty = Math.max(1, variant.stock_count)

  /** Changing variant can invalidate the chosen quantity — clamp instead of failing at add-time. */
  const selectVariant = (id: string) => {
    setVariantId(id)
    const next = activeVariants.find((v) => v.id === id)
    if (next) setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, next.stock_count)))
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
      {/* Gallery */}
      <div>
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface-container-low">
          <Image
            src={product.images[imageIndex].url}
            alt={product.images[imageIndex].alt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
            className="object-cover"
          />
        </div>

        <ul className="mt-4 grid grid-cols-4 gap-3" aria-label={`${product.name} images`}>
          {product.images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setImageIndex(i)}
                aria-label={`Show image ${i + 1} of ${product.images.length}: ${img.alt}`}
                aria-current={i === imageIndex ? 'true' : undefined}
                className={`relative block aspect-square w-full overflow-hidden rounded-xl transition-all ${
                  i === imageIndex
                    ? 'ring-2 ring-primary ring-offset-2'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Detail */}
      <div>
        <h1 className="font-headline-display text-headline-lg-mobile text-primary md:text-headline-lg">
          {product.name}
        </h1>
        <p className="mt-2 font-body-lg text-body-lg italic text-secondary">{product.tagline}</p>

        <p className="mt-6 font-headline-md text-headline-md text-primary" aria-live="polite">
          {formatPrice(variant.price_cents)}
          <span className="ml-2 font-body-md text-body-md font-normal text-on-surface-variant">
            / {variant.weight_label}
          </span>
        </p>

        {/* Stock indicator — icon + text, never colour alone (doc §1.1.5). */}
        <p
          className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 font-label-sm text-label-sm ${
            outOfStock
              ? 'bg-error-container text-on-error-container'
              : lowStock
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-primary/10 text-primary'
          }`}
        >
          {outOfStock ? (
            <>
              <CircleX className="h-4 w-4" aria-hidden="true" /> Out of Stock
            </>
          ) : lowStock ? (
            <>
              <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Low Stock — only{' '}
              {variant.stock_count} left
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden="true" /> In Stock
            </>
          )}
        </p>

        {/* Variants */}
        <fieldset className="mt-8">
          <legend className="mb-3 font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface">
            Size
          </legend>
          <div role="radiogroup" aria-label="Select size" className="flex flex-wrap gap-3">
            {activeVariants.map((v) => {
              const selected = v.id === variantId
              const soldOut = v.stock_count === 0
              return (
                <label
                  key={v.id}
                  className={`cursor-pointer rounded-xl border-2 px-5 py-3 text-center transition-colors ${
                    selected
                      ? 'border-primary bg-primary text-white'
                      : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary'
                  } ${soldOut ? 'opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name={`${groupId}-variant`}
                    value={v.id}
                    checked={selected}
                    onChange={() => selectVariant(v.id)}
                    className="sr-only-live"
                  />
                  <span className="block font-body-md text-body-md font-semibold">
                    {v.weight_label}
                  </span>
                  <span
                    className={`block font-label-sm text-label-sm ${selected ? 'opacity-90' : 'text-on-surface-variant'}`}
                  >
                    {soldOut ? 'Sold out' : formatPrice(v.price_cents)}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Quantity */}
        <div className="mt-8">
          <label
            htmlFor={qtyId}
            className="mb-3 block font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface"
          >
            Quantity
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1 || outOfStock}
              aria-label="Decrease quantity"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant text-primary transition-colors hover:bg-surface-container-high disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              id={qtyId}
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              disabled={outOfStock || !canEdit}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setQuantity(Math.min(Math.max(1, Math.floor(n)), maxQty))
              }}
              className="w-20 rounded-xl border border-outline-variant bg-surface-container-lowest py-2.5 text-center font-body-md text-body-md"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty || outOfStock}
              aria-label="Increase quantity"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant text-primary transition-colors hover:bg-surface-container-high disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={outOfStock || !canEdit}
          onClick={() => {
            addItem(product, variant, quantity)
            toast(`${quantity} × ${product.name} (${variant.weight_label}) added to your cart`)
          }}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {outOfStock ? 'Out of Stock' : !canEdit ? 'Loading cart…' : 'Add to Cart'}
        </button>

        <div className="mt-10 space-y-4 border-t border-outline-variant pt-8">
          <h2 className="font-headline-md text-headline-md text-primary">About this product</h2>
          {product.description.split('\n\n').map((para) => (
            <p
              key={para.slice(0, 32)}
              className="font-body-md text-body-md text-on-surface-variant"
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ProductDetail({
  product,
  lowStockThreshold = LOW_STOCK_THRESHOLD,
}: {
  product: Product
  lowStockThreshold?: number
}) {
  if (!product.variants.length)
    return (
      <section>
        <h1 className="font-headline-lg text-primary">{product.name}</h1>
        <p className="mt-4">This product is currently unavailable.</p>
      </section>
    )
  return <PurchasableDetail product={product} lowStockThreshold={lowStockThreshold} />
}
