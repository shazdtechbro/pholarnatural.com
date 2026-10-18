import type { Metadata } from 'next'
import ShopBrowser from '@/components/ShopBrowser'
import { getProducts } from '@/lib/api/products'
import { CURRENCY } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Shop',
  description:
    'Curated botanical formulations rooted in African tradition and refined by clinical excellence. Shop the Restorative Hair Oil and Botanical Cleanse Shampoo. All prices in CAD.',
  alternates: { canonical: '/shop' },
  openGraph: {
    title: 'Shop | Pholar Natural',
    description: 'Curated botanical haircare formulations. All prices in CAD.',
    url: '/shop',
  },
}

export default async function ShopPage() {
  const products = await getProducts()

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-16">
      <header className="mb-12 text-center md:text-left">
        <h1 className="font-headline-display text-headline-lg-mobile text-primary md:text-headline-display">
          The Shop
        </h1>
        <p className="mt-4 max-w-2xl font-body-lg text-body-lg text-on-surface-variant">
          Curated botanical formulations rooted in African tradition and refined by clinical
          excellence. Experience the ritual of natural hair care.
        </p>
        <p className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          All prices in {CURRENCY}
        </p>
      </header>

      <ShopBrowser products={products} cardImages={{}} />
    </div>
  )
}
