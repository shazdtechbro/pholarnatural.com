import StorefrontRefresh from '@/components/StorefrontRefresh'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import CookieConsent from '@/components/CookieConsent'

/**
 * Storefront chrome. Everything the customer sees sits inside this group; the admin dashboard
 * is in `(admin)/` and deliberately does not get the shop navbar, footer or cookie banner.
 *
 * The skip link is the first focusable element on the page, so a keyboard user's first Tab
 * offers to jump past the navigation (doc §1.1.5).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <StorefrontRefresh />
      <Navbar />
      <main id="main" className="pt-[73px]">
        {children}
      </main>
      <Footer />
      <CookieConsent />
    </>
  )
}
