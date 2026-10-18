import { getPublicSettings } from '@/lib/api/settings'
import { formatPrice } from '@/lib/format'
import type { Metadata } from 'next'
import Link from 'next/link'
import PolicyPage from '@/components/PolicyPage'

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description:
    'Pholar Natural shipping rates and timelines for Canada, the US and the UK. Orders processed in 1–2 business days.',
  alternates: { canonical: '/shipping-policy' },
}

export default async function ShippingPolicyPage() {
  const settings = await getPublicSettings()
  return (
    <PolicyPage
      title="Shipping Policy"
      intro="Where we ship, what it costs, and how long it takes."
      lastUpdated="11 August 2026"
    >
      <h2>Processing time</h2>
      <p>
        Orders are picked, packed and handed to the carrier within 1–2 business days. Orders placed
        on a weekend or public holiday begin processing the next business day. You will receive an
        email when the parcel is dispatched.
      </p>

      <h2>Shipping rates</h2>
      <p>
        Shipping rates are based on your destination country and are shown at checkout before you
        pay. Orders above {formatPrice(Number(settings.free_shipping_threshold_cents))} qualify for
        free shipping.
      </p>

      <h2>Domestic — Canada</h2>
      <ul>
        <li>Standard rate: {formatPrice(Number(settings.shipping_rate_domestic_cents))}</li>
        <li>Transit time: 3–7 business days after dispatch</li>
        <li>Remote and northern postal codes may take longer</li>
      </ul>

      <h2>International</h2>
      <p>
        We ship worldwide. Transit times below are after dispatch and exclude time held in customs.
      </p>
      <ul>
        <li>
          United States: {formatPrice(Number(settings.shipping_rate_us_cents))} · 7–10 business days
        </li>
        <li>
          United Kingdom: {formatPrice(Number(settings.shipping_rate_uk_cents))} · 7–14 business
          days
        </li>
        <li>
          Rest of world: {formatPrice(Number(settings.shipping_rate_international_cents))} · 10–21
          business days
        </li>
      </ul>
      <p>
        <strong>Final international rates are still being confirmed with our carriers.</strong>{' '}
        Until they are published here, the rate you are charged at checkout is the rate that applies
        to your order — it will not change afterwards.
      </p>

      <h3>Customs, duties and import taxes</h3>
      <p>
        Duties and import taxes are set by the destination country and are not included in the price
        you pay us. They are the recipient&apos;s responsibility and are collected by the carrier or
        customs authority on delivery.
      </p>

      <h2>Incorrect addresses</h2>
      <p>
        Please check your address carefully at checkout. If a parcel is returned to us because the
        address was incomplete or incorrect, we will contact you to arrange redelivery; the second
        shipping charge is payable by you.
      </p>

      <h2>Lost or damaged parcels</h2>
      <p>
        If your order arrives damaged, email us within 48 hours of delivery with your order number
        and a photo, and we will replace it at no cost. If tracking shows no movement for 10
        business days, contact us and we will open an investigation with the carrier.
      </p>

      <p>
        See also our <Link href="/refund-policy">refund policy</Link> and{' '}
        <Link href="/terms-of-service">terms of service</Link>.
      </p>
    </PolicyPage>
  )
}
