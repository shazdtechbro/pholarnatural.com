import Link from 'next/link'
import { ArrowRight, BadgeCheck } from 'lucide-react'
import ProductCard from '@/components/ProductCard'
import RevealOnScroll from '@/components/animations/RevealOnScroll'
import { getProducts } from '@/lib/api/products'
import { getPublicSettings, featured } from '@/lib/api/settings'

/** Homepage products showcase (doc §1.2.2). */
export default async function Products() {
  const [catalogue, settings] = await Promise.all([getProducts(), getPublicSettings()])
  const products = featured(catalogue, settings.featured_product_ids)

  return (
    <section id="products" className="scroll-mt-24 bg-surface-container-low py-16">
      <div className="mx-auto max-w-7xl px-5 md:px-16">
        <RevealOnScroll>
          <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-label-sm text-label-sm uppercase tracking-widest text-secondary">
                Our Shop
              </p>
              <h2 className="mt-2 font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg">
                Pure ingredients, real results.
              </h2>
            </div>
            <Link
              href="/shop"
              className="group flex items-center gap-2 font-label-sm text-label-sm text-primary"
            >
              View All Products
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </div>
        </RevealOnScroll>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product, i) => (
            <RevealOnScroll key={product.id} index={i} className="h-full">
              <ProductCard product={product} />
            </RevealOnScroll>
          ))}

          <RevealOnScroll index={products.length} className="hidden h-full lg:block">
            <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-3xl bg-primary-container p-6 text-white">
              <div className="z-10">
                <h3 className="mb-4 font-headline-lg text-headline-md leading-snug text-white">
                  The 100% Organic Promise
                </h3>
                <p className="mb-8 font-body-md text-body-md opacity-90">
                  Every ingredient we source is meticulously tested to ensure tradition meets
                  quality.
                </p>
                <ul className="space-y-4">
                  {['Eco-Certified Ingredients', 'Ethically Hand-Harvested'].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <BadgeCheck
                        className="h-5 w-5 shrink-0 text-secondary-container"
                        aria-hidden="true"
                      />
                      <span className="font-body-md text-body-md">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full border-[24px] border-white/5"
                aria-hidden="true"
              />
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  )
}
