import Link from 'next/link'
import Image from 'next/image'
import { Mail, ShieldCheck } from 'lucide-react'
import { InstagramIcon, FacebookIcon, TikTokIcon } from '@/components/icons/Social'
import { BUSINESS } from '@/lib/config'
import { getServices } from '@/lib/api/services'
import { getPublicSettings } from '@/lib/api/settings'

/**
 * Site footer (doc §1.1.1): four columns — brand plus the Shop, Services and Company link
 * groups — over a legal bar carrying the copyright and the Stripe notice.
 *
 * The four policy pages live in the legal bar rather than inside "Company" so that every
 * policy required by doc §1.13 is reachable from every page.
 *
 * Social links are fetched from admin_settings at render time (5-minute ISR cache).
 * An icon is hidden if the corresponding URL is empty.
 */

type SocialLinks = {
  instagram_url: string
  facebook_url: string
  tiktok_url: string
}

async function getSocialLinks(): Promise<SocialLinks> {
  const settings = await getPublicSettings()
  return {
    instagram_url: settings.instagram_url ?? '',
    facebook_url: settings.facebook_url ?? '',
    tiktok_url: settings.tiktok_url ?? '',
  }
}

export default async function Footer() {
  const year = new Date().getFullYear()
  const [social, services] = await Promise.all([getSocialLinks(), getServices()])

  return (
    <footer className="border-t border-outline-variant bg-surface-container-low">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 py-16 md:grid-cols-2 md:px-16 lg:grid-cols-4">
        <div className="space-y-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Pholar Natural — home">
            <Image src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-headline-md text-[20px] font-bold text-primary md:text-headline-md">
              Pholar Natural
            </span>
          </Link>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Bridging the gap between raw African tradition and premium clinical-grade organic
            beauty.
          </p>
          <address className="font-body-md text-body-md not-italic text-on-surface-variant">
            {BUSINESS.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <span className="mt-2 block">{BUSINESS.hours}</span>
          </address>
          <ul className="flex gap-4">
            {social.instagram_url && (
              <li>
                <a
                  href={social.instagram_url}
                  aria-label="Pholar Natural on Instagram"
                  className="inline-flex rounded-full p-1 text-primary transition-colors hover:text-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <InstagramIcon className="h-5 w-5" />
                </a>
              </li>
            )}
            {social.facebook_url && (
              <li>
                <a
                  href={social.facebook_url}
                  aria-label="Pholar Natural on Facebook"
                  className="inline-flex rounded-full p-1 text-primary transition-colors hover:text-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FacebookIcon className="h-5 w-5" />
                </a>
              </li>
            )}
            {social.tiktok_url && (
              <li>
                <a
                  href={social.tiktok_url}
                  aria-label="Pholar Natural on TikTok"
                  className="inline-flex rounded-full p-1 text-primary transition-colors hover:text-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <TikTokIcon className="h-5 w-5" />
                </a>
              </li>
            )}
            <li>
              <a
                href={`mailto:${BUSINESS.email}`}
                aria-label={`Email Pholar Natural at ${BUSINESS.email}`}
                className="inline-flex rounded-full p-1 text-primary transition-colors hover:text-secondary"
              >
                <Mail className="h-5 w-5" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>

        <FooterColumn
          title="Shop"
          links={[
            { href: '/shop', label: 'All Products' },
            { href: '/shop/restorative-hair-oil', label: 'Restorative Hair Oil' },
            { href: '/shop/botanical-cleanse-shampoo', label: 'Botanical Cleanse Shampoo' },
            { href: '/cart', label: 'Your Cart' },
          ]}
        />

        <FooterColumn
          title="Services"
          links={[
            { href: '/services', label: 'All Services' },
            ...services.slice(0, 3).map((s) => ({ href: `/services#${s.slug}`, label: s.name })),
            { href: '/book', label: 'Book an Appointment' },
          ]}
        />

        <FooterColumn
          title="Company"
          links={[
            { href: '/about', label: 'About Us' },
            { href: '/faq', label: 'FAQ' },
            { href: '/contact', label: 'Contact' },
            { href: '/shipping-policy', label: 'Shipping Info' },
          ]}
        />
      </div>

      <div className="border-t border-outline-variant/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-16">
          <p className="font-body-md text-[12px] text-on-surface-variant">
            © {year} {BUSINESS.name}. All rights reserved. All prices in CAD.
          </p>

          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              { href: '/privacy-policy', label: 'Privacy Policy' },
              { href: '/terms-of-service', label: 'Terms of Service' },
              { href: '/refund-policy', label: 'Refund Policy' },
              { href: '/shipping-policy', label: 'Shipping Policy' },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="font-body-md text-[12px] text-on-surface-variant transition-colors hover:text-primary"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="flex items-center gap-2 font-body-md text-[12px] text-on-surface-variant">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Payments secured by Stripe
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { href: string; label: string }[]
}) {
  return (
    <div>
      <h2 className="mb-6 font-label-sm text-label-sm font-bold uppercase text-primary">{title}</h2>
      <ul className="space-y-4">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className="font-body-md text-body-md text-on-surface-variant transition-colors hover:text-secondary"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
