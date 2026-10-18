import { serializeJsonLd } from '@/lib/json-ld'
import type { Metadata } from 'next'
import Hero from '@/components/Hero'
import Products from '@/components/Products'
import Services from '@/components/Services'
import About from '@/components/About'
import Testimonials from '@/components/Testimonials'
import CTA from '@/components/CTA'
import { SITE_URL, BUSINESS } from '@/lib/config'

export const metadata: Metadata = {
  title: "Pholar Natural | Nature's Finest for Your Crown",
  description:
    'Premium organic haircare and professional beauty treatments rooted in African tradition. Shop the Restorative Hair Oil and Botanical Cleanse Shampoo, or book a service in Toronto.',
  alternates: { canonical: '/' },
}

/**
 * Homepage.
 *
 * This is a Server Component. The page previously rendered as a single 391-line `'use client'`
 * file; each section is now its own component and only the genuinely interactive leaves
 * (ProductCard, the animation primitives) ship JavaScript.
 */
export default function Home() {
  return (
    <>
      {/* LocalBusiness structured data (doc §1.1.2). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'HealthAndBeautyBusiness',
            name: BUSINESS.name,
            description:
              'Premium organic haircare and professional beauty treatments rooted in African tradition.',
            url: SITE_URL,
            email: BUSINESS.email,
            telephone: BUSINESS.phone,
            image: `${SITE_URL}/images/hero/woman-braids.webp`,
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Botanical District, Studio 104',
              addressLocality: 'Toronto',
              addressCountry: 'CA',
            },
            priceRange: '$$',
            currenciesAccepted: 'CAD',
            openingHoursSpecification: [
              {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                opens: '10:00',
                closes: '17:00',
              },
            ],
          }),
        }}
      />
      <Hero />
      <Products />
      <Services />
      <About />
      <Testimonials />
      <CTA />
    </>
  )
}
