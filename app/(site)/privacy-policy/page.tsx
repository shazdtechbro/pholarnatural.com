import type { Metadata } from 'next'
import Link from 'next/link'
import PolicyPage from '@/components/PolicyPage'
import { BUSINESS } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Pholar Natural collects, uses and protects your personal data, which cookies we set, who we share data with, and how to exercise your rights.',
  alternates: { canonical: '/privacy-policy' },
}

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      intro="What we collect, why we collect it, and what you can ask us to do about it."
      lastUpdated="21 October 2026"
    >
      <h2>What we collect</h2>
      <p>We only collect what we need to sell you a product or hold your appointment.</p>
      <ul>
        <li>
          <strong>Order information</strong> — name, email, shipping address, and the items you
          bought.
        </li>
        <li>
          <strong>Booking information</strong> — name, email, optional phone number, and the service,
          date and time you selected.
        </li>
        <li>
          <strong>Contact form submissions</strong> — name, email, subject and message.
        </li>
        <li>
          <strong>Usage data</strong> — anonymous statistics about which pages are visited, only if
          you accept analytics cookies.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> collect or store card details. Payments are handled entirely by
        Stripe and card data never reaches our servers.
      </p>

      <h2>Optional accounts</h2>
      <p>If you choose to create an account, we store your name, email address, a secure password hash, saved cart and sign-in sessions. We never store your password in plain text. A secure, HttpOnly session cookie keeps you signed in for up to 30 days. Verification and password-reset emails help protect your account; creating an account does not subscribe you to marketing.</p>
      <p>After you verify your email, your account shows bookings and orders placed with that email, including guest purchases. You can continue to shop and book without an account. Contact us to request account deletion.</p>
      <h2>Why we collect it</h2>
      <ul>
        <li>To fulfil and deliver your order, and to email you its confirmation</li>
        <li>To confirm, remind you about, or amend your appointment</li>
        <li>To answer your questions when you contact us</li>
        <li>To understand which parts of the site work, so we can improve them</li>
      </ul>
      <p>We do not sell your personal data, and we never have.</p>

      <h2>Cookies</h2>
      <p>You control non-essential cookies through the banner shown on your first visit.</p>
      <ul>
        <li>
          <strong>Essential</strong> — remember your cart and keep checkout secure. These cannot be
          switched off, because the site cannot function without them.
        </li>
        <li>
          <strong>Analytics</strong> — anonymous page-level statistics. Off unless you accept.
        </li>
        <li>
          <strong>Marketing</strong> — used to measure campaigns. Off unless you accept.
        </li>
      </ul>
      <p>
        Guest carts are stored in your browser&apos;s local storage. Clearing browser data clears a guest cart. If you sign in, your cart is also saved on our servers so you can return on another device. Temporary local drafts protect cart changes during connection problems.
      </p>

      <h2>Who we share data with</h2>
      <ul>
        <li>
          <strong>Stripe</strong> — payment processing. Stripe receives the payment details and the
          order amount.
        </li>
        <li>
          <strong>Our email provider</strong> — to send order and booking confirmations.
        </li>
        <li>
          <strong>Shipping carriers</strong> — the delivery address, so your parcel can reach you.
        </li>
      </ul>
      <p>Each of these receives only what it needs to do its job, and nothing more.</p>

      <h2>How long we keep it</h2>
      <p>
        Order and booking records are kept for seven years, because tax and accounting rules require
        it. Contact messages are kept for two years. Analytics data is retained for 14 months.
      </p>

      <h2>Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>Give you a copy of the personal data we hold about you</li>
        <li>Correct anything that is wrong</li>
        <li>Delete your data, where we are not legally required to keep it</li>
        <li>Stop sending you marketing, at any time</li>
      </ul>
      <p>
        Email <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> and we will respond within 30
        days.
      </p>

      <h2>Security</h2>
      <p>
        The site is served over HTTPS and payment processing is delegated to Stripe, a PCI-DSS Level
        1 provider. No system is perfectly secure, but we do not hold the data that would be most
        damaging to lose.
      </p>

      <p>
        See also our <Link href="/terms-of-service">terms of service</Link>.
      </p>
    </PolicyPage>
  )
}
