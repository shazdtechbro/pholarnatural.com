import Link from 'next/link'
import { Clock, ArrowRight } from 'lucide-react'
import ServiceImage from '@/components/ServiceImage'
import TiltCard from '@/components/animations/TiltCard'
import RevealOnScroll from '@/components/animations/RevealOnScroll'
import { getServices } from '@/lib/api/services'
import { getPublicSettings, featured } from '@/lib/api/settings'
import { formatPrice, formatDuration } from '@/lib/format'

/** Homepage services preview (doc §1.2.3) — icon, description, price, duration and a Book CTA per card. */
export default async function Services() {
  const [catalogue, settings] = await Promise.all([getServices(), getPublicSettings()])
  const services = featured(catalogue, settings.featured_service_ids)

  return (
    <section id="services" className="scroll-mt-24 py-16">
      <div className="mx-auto max-w-7xl px-5 md:px-16">
        <RevealOnScroll>
          <div className="mb-12 text-center">
            <p className="font-label-sm text-label-sm uppercase tracking-widest text-secondary">
              Professional Services
            </p>
            <h2 className="mt-2 font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg">
              Beauty treatments crafted for you
            </h2>
          </div>
        </RevealOnScroll>

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((service, i) => (
            <RevealOnScroll as="li" key={service.id} index={i} className="h-full">
              <TiltCard maxTilt={4} className="h-full">
                <article className="tilt-card flex h-full flex-col overflow-hidden rounded-2xl bg-surface-container-lowest">
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <ServiceImage
                      slug={service.slug}
                      src={service.image_url}
                      alt={`${service.name} at Pholar Natural`}
                      variant="tall"
                      sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, (max-width: 1280px) 30vw, 24vw"
                      className="object-cover"
                    />
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
                      aria-hidden="true"
                    />
                    <h3 className="absolute inset-x-4 bottom-4 font-headline-md text-body-lg text-white">
                      {service.name}
                    </h3>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <p className="mb-4 font-body-md text-[13px] text-on-surface-variant">
                      {service.description}
                    </p>
                    <div className="mb-4 mt-auto flex items-center justify-between gap-2">
                      <span className="font-body-md text-body-md font-bold text-primary">
                        {formatPrice(service.price_cents)}
                      </span>
                      <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDuration(service.duration_minutes)}
                      </span>
                    </div>
                    <Link
                      href={`/book?service=${service.slug}`}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-surface-container-high py-2.5 font-label-sm text-label-sm text-primary transition-colors hover:bg-secondary hover:text-white"
                    >
                      Book Appointment
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              </TiltCard>
            </RevealOnScroll>
          ))}
        </ul>

        <RevealOnScroll>
          <div className="mt-10 text-center">
            <Link
              href="/services"
              className="group inline-flex items-center gap-2 font-label-sm text-label-sm text-primary"
            >
              View All Services
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  )
}
