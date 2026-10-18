import { getPublicSettings } from '@/lib/api/settings'
import type { Metadata } from 'next'
import { Mail, MapPin, Phone, Clock } from 'lucide-react'
import ContactForm from '@/components/ContactForm'
import { InstagramIcon, FacebookIcon, TikTokIcon } from '@/components/icons/Social'
import { BUSINESS } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with Pholar Natural. Questions about our botanical blends, an order, or an appointment — we reply within 24 hours.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact | Pholar Natural',
    description: 'Questions about our botanicals or your order? We reply within 24 hours.',
    url: '/contact',
  },
}

export default async function ContactPage() {
  const settings = await getPublicSettings()
  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-16">
      <header className="mb-12 max-w-2xl">
        <h1 className="font-headline-display text-headline-lg-mobile text-primary md:text-headline-display">
          Get in Touch
        </h1>
        <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
          Have questions about our botanical blends or need help with an order? We&apos;re here to
          assist you.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="mb-6 font-headline-md text-headline-md text-primary">Send us a message</h2>
          <ContactForm />
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
            <h2 className="mb-4 font-label-sm text-label-sm font-bold uppercase text-primary">
              Email us
            </h2>
            <p className="flex items-start gap-3 font-body-md text-body-md text-on-surface-variant">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
              <a href={`mailto:${BUSINESS.email}`} className="hover:text-primary hover:underline">
                {BUSINESS.email}
              </a>
            </p>
            <p className="mt-3 flex items-start gap-3 font-body-md text-body-md text-on-surface-variant">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
              <a
                href={`tel:${BUSINESS.phone.replace(/\s/g, '')}`}
                className="hover:text-primary hover:underline"
              >
                {BUSINESS.phone}
              </a>
            </p>
          </section>

          <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
            <h2 className="mb-4 font-label-sm text-label-sm font-bold uppercase text-primary">
              Visit our studio
            </h2>
            <address className="flex items-start gap-3 font-body-md text-body-md not-italic text-on-surface-variant">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
              <span>
                {BUSINESS.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </address>
            <p className="mt-3 flex items-start gap-3 font-body-md text-body-md text-on-surface-variant">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
              {BUSINESS.hours}
            </p>
          </section>

          <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
            <h2 className="mb-4 font-label-sm text-label-sm font-bold uppercase text-primary">
              Socials
            </h2>
            <ul className="flex gap-3">
              {[
                { key: 'instagram_url', name: 'Instagram', Icon: InstagramIcon },
                { key: 'facebook_url', name: 'Facebook', Icon: FacebookIcon },
                { key: 'tiktok_url', name: 'TikTok', Icon: TikTokIcon },
              ]
                .filter((item) => settings[item.key])
                .map(({ key, name, Icon }) => (
                  <li key={key}>
                    <a
                      href={settings[key]}
                      aria-label={`Pholar Natural on ${name}`}
                      rel="noopener noreferrer"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-lowest text-primary"
                    >
                      <Icon className="h-5 w-5" />
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
