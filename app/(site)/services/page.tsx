import { serializeJsonLd } from '@/lib/json-ld'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, ArrowRight, CalendarDays } from 'lucide-react'
import ServiceImage from '@/components/ServiceImage'
import Accordion from '@/components/Accordion'
import RevealOnScroll from '@/components/animations/RevealOnScroll'
import { getServices } from '@/lib/api/services'
import { formatPrice, formatDuration, depositFor } from '@/lib/format'
import { SITE_URL, CURRENCY, BUSINESS, DEPOSIT_RATE } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Services',
  description:
    'French Braids, Cornrows, Cornrow Mix Twist, Natural Twist, Wash and Blow Dry, Hair Treatment and Hair Waxing — professional beauty treatments rooted in African tradition. Book online with a 10% deposit. All prices in CAD.',
  alternates: { canonical: '/services' },
  openGraph: {
    title: 'Services | Pholar Natural',
    description: 'Professional beauty treatments rooted in African tradition. Book online.',
    url: '/services',
  },
}

export default async function ServicesPage() {
  const services = await getServices()

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-16">
      {/* Service structured data (doc §1.1.2). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            services.map((s) => ({
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: s.name,
              description: s.description,
              serviceType: 'Hair care',
              provider: { '@type': 'HealthAndBeautyBusiness', name: BUSINESS.name, url: SITE_URL },
              areaServed: 'Toronto, CA',
              offers: {
                '@type': 'Offer',
                price: (s.price_cents / 100).toFixed(2),
                priceCurrency: CURRENCY,
                url: `${SITE_URL}/book?service=${s.slug}`,
              },
            })),
          ),
        }}
      />

      <header className="mb-12 max-w-2xl">
        <h1 className="font-headline-display text-headline-lg-mobile text-primary md:text-headline-display">
          Our Services
        </h1>
        <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
          Rooted in tradition, crafted for your natural beauty. Every appointment is held with a{' '}
          {Math.round(DEPOSIT_RATE * 100)}% deposit, and we are open {BUSINESS.hours}.
        </p>
        <p className="mt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          All prices in {CURRENCY}
        </p>
      </header>

      {/* Cards */}
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service, i) => (
          <RevealOnScroll as="li" key={service.id} index={i} className="h-full">
            <article
              id={service.slug}
              className="flex h-full scroll-mt-28 flex-col overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <ServiceImage
                  slug={service.slug}
                  src={service.image_url}
                  alt={`${service.name} at Pholar Natural`}
                  variant="card"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                  priority={i < 2}
                />
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h2 className="font-headline-md text-headline-md text-primary">{service.name}</h2>
                <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                  {service.description}
                </p>

                <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only-live">Price</dt>
                    <dd className="font-headline-md text-body-lg font-bold text-primary">
                      {formatPrice(service.price_cents)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only-live">Duration</dt>
                    <dd className="flex items-center gap-1.5 font-body-md text-body-md text-on-surface-variant">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {formatDuration(service.duration_minutes)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-2 font-body-md text-[13px] text-on-surface-variant">
                  Deposit to book: {formatPrice(depositFor(service.price_cents))}
                </p>

                <Link
                  href={`/book?service=${service.slug}`}
                  className="mt-6 flex items-center justify-center gap-2 rounded-full bg-secondary py-3 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
                >
                  Book Now
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          </RevealOnScroll>
        ))}
      </ul>

      {/* Detail accordion (doc §1.5) */}
      <section className="mt-20">
        <h2 className="mb-6 font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg">
          What each service involves
        </h2>
        <Accordion
          items={services.map((s) => ({
            id: s.slug,
            title: `${s.name} — ${formatDuration(s.duration_minutes)}, ${formatPrice(s.price_cents)}`,
            content: (
              <div className="space-y-4">
                <p>{s.long_description}</p>
                <div>
                  <h4 className="mb-2 font-label-sm text-label-sm font-bold uppercase text-primary">
                    What to expect
                  </h4>
                  <ul className="list-disc space-y-1 pl-5">
                    {s.what_to_expect.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 font-label-sm text-label-sm font-bold uppercase text-primary">
                    How to prepare
                  </h4>
                  <p>
                    Come with your hair detangled and free of heavy product. Allow{' '}
                    {formatDuration(s.duration_minutes)} in the chair, and arrive five minutes early
                    so we can start on time.
                  </p>
                </div>
                <Link
                  href={`/book?service=${s.slug}`}
                  className="inline-flex items-center gap-2 font-label-sm text-label-sm text-primary underline underline-offset-4"
                >
                  Book {s.name}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            ),
          }))}
        />
      </section>

      {/* Pricing table (doc §1.5) */}
      <section className="mt-20">
        <h2 className="mb-6 font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg">
          Pricing at a glance
        </h2>
        <div className="relative overflow-x-auto rounded-2xl border border-outline-variant">
          <table className="w-full min-w-[36rem] border-collapse bg-surface-container-lowest text-left">
            <caption className="sr-only-live">
              Service prices and durations. All prices in {CURRENCY}.
            </caption>
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th scope="col" className="p-4 font-label-sm text-label-sm uppercase text-primary">
                  Service
                </th>
                <th scope="col" className="p-4 font-label-sm text-label-sm uppercase text-primary">
                  Duration
                </th>
                <th scope="col" className="p-4 font-label-sm text-label-sm uppercase text-primary">
                  Price
                </th>
                <th scope="col" className="p-4 font-label-sm text-label-sm uppercase text-primary">
                  Deposit
                </th>
                <th scope="col" className="p-4">
                  <span className="sr-only-live">Book</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b border-outline-variant/60 last:border-0">
                  <th
                    scope="row"
                    className="p-4 font-body-md text-body-md font-semibold text-on-surface"
                  >
                    {s.name}
                  </th>
                  <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                    {formatDuration(s.duration_minutes)}
                  </td>
                  <td className="p-4 font-body-md text-body-md font-bold text-primary">
                    {formatPrice(s.price_cents)}
                  </td>
                  <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                    {formatPrice(depositFor(s.price_cents))}
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/book?service=${s.slug}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-container-high px-4 py-2 font-label-sm text-label-sm text-primary transition-colors hover:bg-secondary hover:text-white"
                    >
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      Book
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
