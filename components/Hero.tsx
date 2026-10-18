import Link from 'next/link'
import { ArrowRight, Globe, Leaf, ChevronDown } from 'lucide-react'
import HeroCarousel from '@/components/HeroCarousel'
import RevealOnScroll from '@/components/animations/RevealOnScroll'
import ParallaxSection, { ParallaxBlob } from '@/components/animations/ParallaxSection'
import Image from 'next/image'
import { getProducts } from '@/lib/api/products'
import { getServices } from '@/lib/api/services'
import { getPublicSettings } from '@/lib/api/settings'

/*
 * Counted from the data rather than hardcoded. The service list changes — it went from five to
 * seven — and a stat that has to be remembered separately is a stat that goes stale.
 */
/** Homepage hero uses the same active catalogue as administration and the shop. */
export default async function Hero() {
  const [products, services, settings] = await Promise.all([
    getProducts(),
    getServices(),
    getPublicSettings(),
  ])
  const STATS = [
    { value: '10k+', label: 'Happy Customers' },
    { value: String(products.length), label: 'Products' },
    { value: String(services.length), label: 'Services' },
  ]
  return (
    <section className="relative mx-auto max-w-7xl overflow-hidden px-5 py-16 md:px-16">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
        <div className="z-10 order-2 lg:order-1">
          <RevealOnScroll>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-secondary-container px-4 py-1.5 font-label-sm text-label-sm text-on-secondary-container">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
              </span>
              <Globe className="h-4 w-4" aria-hidden="true" />
              Now Shipping Worldwide
            </p>
          </RevealOnScroll>

          <RevealOnScroll index={1}>
            <h1 className="mb-6 font-headline-display text-headline-lg-mobile leading-tight text-primary md:text-headline-display">
              Nature&apos;s finest for
              <br />
              <span className="italic text-secondary">your crown</span>.
            </h1>
          </RevealOnScroll>

          <RevealOnScroll index={2}>
            <p className="mb-6 max-w-lg font-body-lg text-body-lg text-on-surface-variant">
              Elevate your haircare routine with our premium organic solutions, blending traditional
              African wisdom with clinical-grade botanical ingredients.
            </p>
          </RevealOnScroll>

          <RevealOnScroll index={3}>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/shop"
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 font-label-sm text-label-sm text-white transition-colors hover:bg-primary-container"
              >
                Shop Collection
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/services"
                className="rounded-full border-2 border-secondary px-8 py-4 text-center font-label-sm text-label-sm text-secondary transition-colors hover:bg-secondary/5"
              >
                Book a Service
              </Link>
            </div>
          </RevealOnScroll>

          <RevealOnScroll index={4}>
            <dl className="grid grid-cols-3 gap-4 border-t border-outline-variant pt-6">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only-live">{s.label}</dt>
                  <dd>
                    <span className="block font-headline-md text-headline-md text-primary">
                      {s.value}
                    </span>
                    <span
                      className="font-label-sm text-label-sm uppercase text-on-surface-variant"
                      aria-hidden="true"
                    >
                      {s.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </RevealOnScroll>
        </div>

        <div className="relative order-1 lg:order-2">
          <ParallaxSection offset={28}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-2xl">
              {settings.hero_image_url ? (
                <Image
                  src={settings.hero_image_url}
                  alt="Pholar Natural studio"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                  className="object-cover"
                />
              ) : (
                <HeroCarousel />
              )}
            </div>
          </ParallaxSection>

          {/*
            Floating certification badge (doc §1.2.1). The CAD badge that sat opposite this one
            was removed at the client's request; "All prices in CAD" is still stated on the
            closing CTA, the shop page and the footer, so the doc's currency requirement holds.
          */}
          <p className="glass-effect absolute -left-2 top-8 flex items-center gap-2 rounded-full px-4 py-2 font-label-sm text-label-sm text-primary shadow-lg md:-left-6">
            <Leaf className="h-4 w-4 text-secondary" aria-hidden="true" />
            100% Natural
          </p>

          <ParallaxBlob
            className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-secondary-container/30"
            offset={32}
          />
          <ParallaxBlob
            className="absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-primary-container/10"
            offset={-24}
            delay="-5s"
          />
        </div>
      </div>

      <a
        href="#products"
        className="mx-auto mt-12 flex w-fit flex-col items-center gap-1 font-label-sm text-label-sm uppercase text-on-surface-variant transition-colors hover:text-primary"
      >
        Discover
        <ChevronDown className="h-5 w-5 animate-bounce" aria-hidden="true" />
      </a>
    </section>
  )
}
