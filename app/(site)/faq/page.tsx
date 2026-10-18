import { serializeJsonLd } from '@/lib/json-ld'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import FaqBrowser from '@/components/FaqBrowser'
import { FAQS } from '@/lib/faq'

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers about Pholar Natural products, booking and appointments, shipping, payments and returns. All prices in CAD.',
  alternates: { canonical: '/faq' },
  openGraph: {
    title: 'FAQ | Pholar Natural',
    description: 'Answers about our botanicals, services, shipping and returns.',
    url: '/faq',
  },
}

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:px-16">
      {/* FAQPage structured data — makes the answers eligible for rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          }),
        }}
      />

      <header className="mb-10">
        <h1 className="font-headline-display text-headline-lg-mobile text-primary md:text-headline-display">
          Frequently Asked Questions
        </h1>
        <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
          Find answers to common enquiries about our botanicals and services.
        </p>
      </header>

      <FaqBrowser />

      <section className="mt-16 rounded-2xl bg-surface-container-low p-8 text-center">
        <h2 className="font-headline-md text-headline-md text-primary">Still have questions?</h2>
        <p className="mx-auto mt-2 max-w-md font-body-md text-body-md text-on-surface-variant">
          We answer every message within 24 hours.
        </p>
        <Link
          href="/contact"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
        >
          Contact us
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
