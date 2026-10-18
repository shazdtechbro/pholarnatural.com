'use client'

import { useMemo, useState } from 'react'
import { SearchX } from 'lucide-react'
import ProductCard from '@/components/ProductCard'
import SearchBar from '@/components/SearchBar'
import ProductFilters, { type Category, type Sort } from '@/components/ProductFilters'
import RevealOnScroll from '@/components/animations/RevealOnScroll'
import { lowestPriceCents } from '@/lib/data'
import type { Product } from '@/lib/types'

/**
 * Catalog browser for `/shop` (doc §1.3.1).
 *
 * The full product list is passed down from the server component, so filtering, search and sort
 * are instant and never round-trip. When the real API lands the same props can be fed from
 * `GET /api/products?category=&q=` without touching this component.
 */
export default function ShopBrowser({
  products,
  cardImages,
}: {
  products: Product[]
  cardImages: Record<string, string>
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('All Products')
  const [sort, setSort] = useState<Sort>('featured')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = products.filter((p) => {
      const matchesCategory = category === 'All Products' || p.category === category
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })

    const sorted = [...filtered]
    if (sort === 'price-asc') sorted.sort((a, b) => lowestPriceCents(a) - lowestPriceCents(b))
    if (sort === 'price-desc') sorted.sort((a, b) => lowestPriceCents(b) - lowestPriceCents(a))
    if (sort === 'newest')
      sorted.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    if (sort === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [products, query, category, sort])

  const filtersActive = query !== '' || category !== 'All Products'

  const clearAll = () => {
    setQuery('')
    setCategory('All Products')
    setSort('featured')
  }

  return (
    <>
      <div className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-low p-4">
        <div className="mb-4">
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <ProductFilters
          categories={['All Products', ...new Set(products.map((p) => p.category))]}
          category={category}
          onCategoryChange={setCategory}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

      {/*
        Announced to screen readers whenever the count changes, so a filter that removes results
        is not a silent, purely visual event (doc §1.1.5).
      */}
      <p aria-live="polite" className="mb-6 font-body-md text-body-md text-on-surface-variant">
        Showing {visible.length} of {products.length}{' '}
        {products.length === 1 ? 'product' : 'products'}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant py-20 text-center">
          <SearchX className="mx-auto mb-4 h-10 w-10 text-outline" aria-hidden="true" />
          <h2 className="mb-2 font-headline-md text-headline-md text-primary">
            No products match your search
          </h2>
          <p className="mb-6 font-body-md text-body-md text-on-surface-variant">
            Try a different term, or clear the filters to see everything.
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full bg-primary px-6 py-3 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {visible.map((product, i) => (
              <RevealOnScroll as="li" key={product.id} index={i} className="h-full">
                <ProductCard
                  product={product}
                  imageUrl={cardImages[product.slug]}
                  priority={i < 2}
                />
              </RevealOnScroll>
            ))}
          </ul>

          {filtersActive && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={clearAll}
                className="font-label-sm text-label-sm text-on-surface-variant underline underline-offset-4 hover:text-primary"
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
