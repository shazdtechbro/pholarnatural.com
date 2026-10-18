'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useId, useState } from 'react'
import { Plus, Star, ArrowRight } from 'lucide-react'
import TiltCard from '@/components/animations/TiltCard'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { formatPrice } from '@/lib/format'
import type { Product } from '@/lib/types'

interface ProductCardProps {
  product: Product
  /** Overrides the product's own hero image — `/shop` uses a different crop from Stitch. */
  imageUrl?: string
  priority?: boolean
}

/**
 * Product card used on the homepage grid and `/shop` (doc §1.3.2).
 *
 * Variant selection is a radiogroup rather than a row of buttons: the variants are mutually
 * exclusive, so arrow-key navigation between them is what a keyboard user expects, and the
 * selected variant is announced. The price and Add to Cart both track the selection.
 */
export default function ProductCard({ product, imageUrl, priority = false }: ProductCardProps) {
  const activeVariants = product.variants.filter((v) => v.is_active)
  const firstInStock = activeVariants.find((v) => v.stock_count > 0) ?? activeVariants[0]
  const [variantId, setVariantId] = useState(firstInStock?.id ?? '')
  const variant = activeVariants.find((v) => v.id === variantId) ?? firstInStock
  const { addItem } = useCart()
  const { toast } = useToast()
  const groupId = useId()

  const outOfStock = (variant?.stock_count ?? 0) <= 0 || (variant?.price_cents ?? 0) <= 0

  return (
    <TiltCard maxTilt={5} className="h-full">
      <article className="tilt-card flex h-full flex-col overflow-hidden rounded-3xl bg-surface-container-lowest p-4">
        <Link
          href={`/shop/${product.slug}`}
          className="group relative mb-6 block aspect-square overflow-hidden rounded-2xl"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Image
            src={imageUrl ?? product.images[0].url}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 400px"
            priority={priority}
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
          {product.is_bestseller && (
            <span className="absolute left-4 top-4 rounded-full bg-secondary-container px-3 py-1 font-label-sm text-[10px] font-bold uppercase text-on-secondary-container">
              Bestseller
            </span>
          )}
          {product.rating && (
            <span className="glass-effect absolute right-4 top-4 flex items-center gap-1 rounded-full px-3 py-1 font-label-sm text-label-sm">
              <Star className="h-3 w-3 fill-current text-secondary" aria-hidden="true" />
              {product.rating.toFixed(1)}
            </span>
          )}
        </Link>

        <div className="flex flex-1 flex-col px-2">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h3 className="font-headline-md text-headline-md text-on-surface">
              <Link href={`/shop/${product.slug}`} className="hover:text-primary">
                {product.name}
              </Link>
            </h3>
            <span className="whitespace-nowrap font-body-md text-body-md font-bold text-primary">
              {variant ? formatPrice(variant.price_cents) : 'Currently unavailable'}
            </span>
          </div>

          <p className="mb-4 font-body-md text-[13px] italic text-on-surface-variant">
            {product.tagline}
          </p>

          <fieldset className="mb-6">
            <legend className="mb-2 font-label-sm text-[11px] uppercase tracking-wider text-on-surface-variant">
              Size
            </legend>
            <div
              role="radiogroup"
              aria-label={`${product.name} size`}
              className="flex flex-wrap gap-2"
            >
              {activeVariants.map((v) => {
                const selected = v.id === variantId
                const soldOut = v.stock_count === 0
                return (
                  <label
                    key={v.id}
                    className={`cursor-pointer rounded-full px-3 py-1.5 font-label-sm text-[11px] font-bold uppercase transition-colors ${
                      selected
                        ? 'bg-primary text-white'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                    } ${soldOut ? 'line-through opacity-50' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`${groupId}-variant`}
                      value={v.id}
                      checked={selected}
                      onChange={() => setVariantId(v.id)}
                      className="sr-only-live"
                    />
                    {v.weight_label}
                    {soldOut && <span className="sr-only-live"> — sold out</span>}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-auto space-y-2">
            <button
              type="button"
              disabled={outOfStock}
              onClick={() => {
                if (variant) addItem(product, variant)
                toast(`${product.name} (${variant.weight_label}) added to your cart`)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-container-highest py-3 font-label-sm text-label-sm text-primary transition-all hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-container-highest disabled:hover:text-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {outOfStock ? 'Out of Stock' : 'Add to Cart'}
            </button>
            <Link
              href={`/shop/${product.slug}`}
              className="flex w-full items-center justify-center gap-1 py-1 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:text-primary"
            >
              View Details
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </article>
    </TiltCard>
  )
}
