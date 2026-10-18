'use client'

import { useId } from 'react'

export const CATEGORIES = ['All Products', 'Hair Oil', 'Shampoo'] as const
export type Category = string

export const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name: A–Z' },
] as const
export type Sort = (typeof SORTS)[number]['value']

interface ProductFiltersProps {
  categories?: string[]
  category: Category
  onCategoryChange: (c: Category) => void
  sort: Sort
  onSortChange: (s: Sort) => void
}

/**
 * Category pills and the sort select (doc §1.3.1).
 *
 * Categories are a radiogroup — one is always active and they are mutually exclusive, so a row
 * of toggle buttons would misreport the state to assistive tech. `aria-checked` carries the
 * selection; the sage fill is only the visual half of that.
 */
export default function ProductFilters({
  categories = [...CATEGORIES],
  category,
  onCategoryChange,
  sort,
  onSortChange,
}: ProductFiltersProps) {
  const sortId = useId()

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div role="radiogroup" aria-label="Filter by category" className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = c === category
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onCategoryChange(c)}
              className={`rounded-full px-5 py-2 font-label-sm text-label-sm transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {c}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={sortId} className="font-label-sm text-label-sm text-on-surface-variant">
          Sort:
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(e) => onSortChange(e.target.value as Sort)}
          className="rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 font-body-md text-body-md text-on-surface"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
