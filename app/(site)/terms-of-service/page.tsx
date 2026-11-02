import type { Metadata } from 'next'
import Link from 'next/link'
import PolicyPage from '@/components/PolicyPage'
import { BUSINESS, CANCELLATION_POLICY, DEPOSIT_RATE } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms governing use of the Pholar Natural website, product purchases, and salon service bookings.',
  alternates: { canonical: '/terms-of-service' },
}

export default function TermsOfServicePage() {
  return (
    <PolicyPage
      title="Terms of Service"
      intro="The terms you agree to when you use this site, buy a product, or book an appointment."
      lastUpdated="11 August 2026"
    >
      <h2>Use of this site</h2>
      <p>
        By using this website you agree to these terms. If you do not agree with them, please do not
        use the site. We may update these terms; the &ldquo;last updated&rdquo; date above tells you
        when they last changed, and continued use after a change means you accept it.
      </p>
      <p>
        You agree not to misuse the site — no attempting to gain unauthorised access, no automated
        scraping that degrades service for others, and no using it for anything unlawful.
      </p>

      <h2>Product purchases</h2>
      <ul>
        <li>All prices are in US dollars (USD) and include no taxes unless stated.</li>
        <li>
          Placing an order is an offer to buy. A contract forms when we send your order confirmation
          email.
        </li>
        <li>
          We may decline or cancel an order — for example if an item is out of stock, or if a price
          was listed in error. If we do, you are refunded in full.
        </li>
        <li>
          Product photography is representative. Natural botanicals vary in colour and scent between
          batches; that is a property of the ingredients, not a defect.
        </li>
        <li>Risk in the goods passes to you on delivery.</li>
      </ul>

      <h2>Service bookings</h2>
      <ul>
        <li>
          Appointments are held with a {Math.round(DEPOSIT_RATE * 100)}% deposit, which is credited
          against the final price.
        </li>
        <li>
          We operate {BUSINESS.hours}. Appointments start on the hour and we ask that you arrive five
          minutes early.
        </li>
        <li>
          If you are more than 15 minutes late we may need to shorten or rebook the service, so the
          clients after you are not delayed.
        </li>
        <li>
          Cancellation terms — including the {CANCELLATION_POLICY.fullRefundWithinMinutes}-minute
          full-refund window and the {CANCELLATION_POLICY.forfeitWithinHours}-hour forfeit — are set
          out in the <Link href="/refund-policy">refund policy</Link>, which forms part of these
          terms.
        </li>
        <li>
          Tell us about allergies, scalp conditions, or recent chemical treatments before your
          appointment. We may decline a service where we judge it unsafe for your hair or scalp.
        </li>
      </ul>

      <h2>Results</h2>
      <p>
        Haircare results vary between individuals. We describe our products and services honestly,
        but we do not guarantee a specific outcome for any particular person&apos;s hair.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Pholar Natural name, logo, product photography and site copy belong to us. You may not
        reproduce them commercially without written permission.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, our total liability arising from an order or an
        appointment is limited to the amount you paid for it. We are not liable for indirect or
        consequential losses. Nothing in these terms limits liability for death or personal injury
        caused by our negligence, or for fraud — those cannot be excluded and we do not attempt to.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Province of Ontario and the federal laws of
        Canada applicable there.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
      </p>

      <p>
        See also our <Link href="/privacy-policy">privacy policy</Link>,{' '}
        <Link href="/refund-policy">refund policy</Link> and{' '}
        <Link href="/shipping-policy">shipping policy</Link>.
      </p>
    </PolicyPage>
  )
}
