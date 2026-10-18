import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import ToastViewport from '@/components/Toast'
import { CartProvider } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { SITE_URL, BUSINESS } from '@/lib/config'

const playfair = localFont({
  src: './fonts/playfair-display-latin-wght-normal.woff2',
  variable: '--font-playfair',
  weight: '600 700',
  style: 'normal',
  fallback: ['Georgia', 'serif'],
  display: 'swap',
})

const montserrat = localFont({
  src: './fonts/montserrat-latin-wght-normal.woff2',
  variable: '--font-montserrat',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Pholar Natural | Nature's Finest for Your Crown",
    template: '%s | Pholar Natural',
  },
  description:
    'Elevate your haircare routine with our premium organic solutions, blending traditional African wisdom with clinical-grade botanical ingredients. Shop haircare and book salon services in Toronto.',
  applicationName: BUSINESS.name,
  manifest: '/manifest.json',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: BUSINESS.name,
    locale: 'en_CA',
    url: SITE_URL,
    title: "Pholar Natural | Nature's Finest for Your Crown",
    description:
      'Premium organic haircare and professional beauty treatments, rooted in African tradition.',
    images: [{ url: '/images/hero/woman-braids.webp', width: 1200, height: 630, alt: BUSINESS.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Pholar Natural | Nature's Finest for Your Crown",
    description:
      'Premium organic haircare and professional beauty treatments, rooted in African tradition.',
    images: ['/images/hero/woman-braids.webp'],
  },
}

/**
 * Root layout — document shell and the providers shared by both the storefront and the admin.
 *
 * The storefront chrome (navbar, footer, cookie banner) lives in `(site)/layout.tsx`, not here,
 * so the admin dashboard under `(admin)/` does not inherit it.
 *
 * `data-scroll-behavior="smooth"` is required alongside the `scroll-smooth` class in Next 16:
 * the router no longer suppresses smooth scrolling during route transitions, so without this
 * attribute every navigation animates its scroll instead of jumping.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${playfair.variable} ${montserrat.variable} scroll-smooth`}
    >
      <body className="bg-background font-body-md text-on-surface overflow-x-hidden">
        <ToastProvider>
          <CartProvider>
            {children}
            <ToastViewport />
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
