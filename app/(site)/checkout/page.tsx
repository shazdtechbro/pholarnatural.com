'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Lock, AlertCircle, ArrowLeft, Loader2, Tag, X } from 'lucide-react'
import { Field, FieldSet } from '@/components/FormField'
import { CartSyncNotice } from '@/components/CustomerAccount'
import { useCustomer } from '@/context/CustomerContext'
import { useCart } from '@/context/CartContext'
import { formatPrice } from '@/lib/format'
import { CURRENCY } from '@/lib/config'
import { createOrder } from '@/lib/api/orders'
import { getPublicSettings } from '@/lib/api/settings'
import { validateDiscount } from '@/lib/api/discounts'
import type { ShippingAddress } from '@/lib/types'

type RateConfig = {
  shipping_rate_domestic_cents: number
  shipping_rate_us_cents: number
  shipping_rate_uk_cents: number
  shipping_rate_international_cents: number
  tax_rate_percent: number
  free_shipping_threshold_cents: number
}

const RATE_DEFAULTS: RateConfig = {
  shipping_rate_domestic_cents: 995,
  shipping_rate_us_cents: 1499,
  shipping_rate_uk_cents: 1999,
  shipping_rate_international_cents: 2499,
  tax_rate_percent: 13,
  free_shipping_threshold_cents: 5000,
}

type Errors = Partial<Record<keyof ShippingAddress | 'email', string>>

const EMPTY: ShippingAddress = {
  full_name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Canada',
}

export default function CheckoutPage() {
  const { ready } = useCustomer()
  return ready ? <CheckoutForm /> : <p className="px-5 py-20 text-center" role="status">Loading checkout…</p>
}

function CheckoutForm() {
  const { items, subtotalCents, hydrated, canEdit, startCheckout } = useCart()

  const { customer } = useCustomer()
  const [address, setAddress] = useState<ShippingAddress>(() => ({ ...EMPTY, full_name: customer?.name ?? '' }))
  const [email, setEmail] = useState(customer?.email ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [rateConfig, setRateConfig] = useState<RateConfig>(RATE_DEFAULTS)

  const [ratesReady, setRatesReady] = useState(false)
  useEffect(() => {
    let stopped = false
    const loadRates = () => {
      if (document.visibilityState === 'hidden') return
      getPublicSettings()
        .then((data) => {
          if (stopped) return
          const number = (key: keyof RateConfig) =>
            data[key] !== undefined && Number.isFinite(Number(data[key]))
              ? Number(data[key])
              : RATE_DEFAULTS[key]
          setRateConfig({
            shipping_rate_domestic_cents: number('shipping_rate_domestic_cents'),
            shipping_rate_us_cents: number('shipping_rate_us_cents'),
            shipping_rate_uk_cents: number('shipping_rate_uk_cents'),
            shipping_rate_international_cents: number('shipping_rate_international_cents'),
            tax_rate_percent: number('tax_rate_percent'),
            free_shipping_threshold_cents: number('free_shipping_threshold_cents'),
          })
          setRatesReady(true)
          setFormError((previous) =>
            previous?.startsWith('We could not load current shipping rates.') ? null : previous,
          )
        })
        .catch(() => {
          if (stopped) return
          setRatesReady(false)
          setFormError('We could not load current shipping rates. Refresh this page before paying.')
        })
    }
    loadRates()
    window.addEventListener('focus', loadRates)
    const timer = setInterval(loadRates, 30000)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', loadRates)
    }
  }, [])

  const [discountCode, setDiscountCode] = useState('')
  const [discountValidating, setDiscountValidating] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string
    discount_cents: number
    discount_type: string
    value: number
    message: string
  } | null>(null)

  async function applyDiscount() {
    const code = discountCode.trim()
    if (!code) return
    setDiscountValidating(true)
    setDiscountError(null)
    try {
      const result = await validateDiscount(code, subtotalCents)
      setAppliedDiscount({
        code: result.code,
        discount_cents: result.discount_cents,
        discount_type: result.discount_type,
        value: result.value,
        message: result.message,
      })
      setDiscountCode('')
    } catch (err) {
      setDiscountError(err instanceof Error ? err.message : 'Invalid discount code.')
    } finally {
      setDiscountValidating(false)
    }
  }

  function removeDiscount() {
    setAppliedDiscount(null)
    setDiscountError(null)
  }

  const discountCents = appliedDiscount
    ? Math.min(
        subtotalCents,
        appliedDiscount.discount_type === 'percentage'
          ? Math.round((subtotalCents * appliedDiscount.value) / 100)
          : appliedDiscount.value,
      )
    : 0
  const discountedSubtotal = subtotalCents - discountCents

  function shippingCentsFor(country: string): number {
    const c = country.trim().toLowerCase()
    if (c === 'canada' || c === 'ca') return rateConfig.shipping_rate_domestic_cents
    if (c === 'united states' || c === 'us' || c === 'usa') return rateConfig.shipping_rate_us_cents
    if (c === 'united kingdom' || c === 'uk' || c === 'gb' || c === 'great britain')
      return rateConfig.shipping_rate_uk_cents
    return rateConfig.shipping_rate_international_cents
  }

  const computedShippingCents =
    subtotalCents > rateConfig.free_shipping_threshold_cents ? 0 : shippingCentsFor(address.country)
  const taxCents = Math.round(
    ((discountedSubtotal + computedShippingCents) * rateConfig.tax_rate_percent) / 100,
  )
  const effectiveTotalCents = discountedSubtotal + computedShippingCents + taxCents

  const set = (key: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [key]: e.target.value }))

  function validate(): boolean {
    const next: Errors = {}
    if (!email.trim()) next.email = 'Enter an email so we can send your confirmation.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address.'
    if (!address.full_name.trim()) next.full_name = 'Enter the recipient name.'
    if (!address.address_line1.trim()) next.address_line1 = 'Enter the street address.'
    if (!address.city.trim()) next.city = 'Enter a city.'
    if (!address.province.trim()) next.province = 'Enter a province or state.'
    if (!address.postal_code.trim()) next.postal_code = 'Enter a postal or ZIP code.'
    if (!address.country.trim()) next.country = 'Enter a country.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!ratesReady) {
      setFormError('Current shipping rates must load before payment. Please refresh.')
      return
    }
    if (!validate()) {
      setFormError('Please correct the highlighted fields.')
      return
    }
    setSubmitting(true)

    try {
      const response = await createOrder({
        customer_name: address.full_name,
        customer_email: email,
        shipping_address: {
          full_name: address.full_name,
          address_line1: address.address_line1,
          address_line2: address.address_line2 || undefined,
          city: address.city,
          province: address.province,
          postal_code: address.postal_code,
          country: address.country,
        },
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        discount_code: appliedDiscount?.code,
      })

      if (
        !response.confirmation_token ||
        !response.checkout_url ||
        new URL(response.checkout_url).protocol !== 'https:' ||
        new URL(response.checkout_url).hostname !== 'checkout.stripe.com'
      ) {
        throw new Error(
          'Checkout is temporarily unavailable. Please refresh and try again shortly.',
        )
      }
      // Preserve the cart on payment failure or cancellation. Clear only after verified payment.
      startCheckout(response.order_id)
      window.location.href = response.checkout_url
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (!hydrated)
    return (
      <p className="px-5 py-20" role="status">
        Loading your cart…
      </p>
    )

  if (!canEdit) return <div className="mx-auto max-w-2xl px-5 py-16"><h1 className="font-headline-display text-2xl text-primary">Let’s reconnect your cart</h1><CartSyncNotice /><Link href="/cart" className="text-primary underline">Back to cart</Link></div>

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center md:px-16">
        <h1 className="mb-3 font-headline-display text-headline-lg-mobile text-primary md:text-headline-lg">
          Nothing to check out
        </h1>
        <p className="mb-8 font-body-lg text-body-lg text-on-surface-variant">
          Your cart is empty, so there is nothing to pay for yet.
        </p>
        <Link
          href="/shop"
          className="inline-flex rounded-full bg-primary px-8 py-4 font-label-sm text-label-sm text-white"
        >
          Browse the shop
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-16">
      <Link
        href="/cart"
        className="mb-6 inline-flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to cart
      </Link>

      <h1 className="mb-2 font-headline-display text-headline-lg-mobile text-primary md:text-headline-lg">
        Checkout
      </h1>
      <p className="mb-10 font-body-md text-body-md text-on-surface-variant">
        {customer ? `Checking out as ${customer.email}. We’ll email your receipt and order updates.` : <>Guest checkout. No account needed. <Link href="/account?next=/checkout" className="font-semibold text-primary underline">Sign in</Link> to use your saved cart, or continue below.</>}
      </p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="space-y-10">
          {formError && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container"
            >
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}

          <FieldSet legend="Contact">
            <Field
              label="Email address"
              type="email"
              required
              value={email}
              error={errors.email}
              hint="We only use this to send your order confirmation. No account needed."
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </FieldSet>

          <FieldSet legend="Shipping address">
            <Field
              label="Full name"
              required
              value={address.full_name}
              error={errors.full_name}
              onChange={set('full_name')}
              autoComplete="name"
            />
            <Field
              label="Address line 1"
              required
              value={address.address_line1}
              error={errors.address_line1}
              onChange={set('address_line1')}
              autoComplete="address-line1"
            />
            <Field
              label="Address line 2"
              value={address.address_line2}
              onChange={set('address_line2')}
              autoComplete="address-line2"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="City"
                required
                value={address.city}
                error={errors.city}
                onChange={set('city')}
                autoComplete="address-level2"
              />
              <Field
                label="Province / State"
                required
                value={address.province}
                error={errors.province}
                onChange={set('province')}
                autoComplete="address-level1"
              />
              <Field
                label="Postal / ZIP code"
                required
                value={address.postal_code}
                error={errors.postal_code}
                onChange={set('postal_code')}
                autoComplete="postal-code"
              />
              <Field
                label="Country"
                required
                value={address.country}
                error={errors.country}
                onChange={set('country')}
                autoComplete="country-name"
              />
            </div>
          </FieldSet>

          <FieldSet legend="Shipping method">
            <div className="rounded-xl border-2 border-primary bg-surface-container-lowest p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-body-md text-body-md font-semibold text-on-surface">
                    Standard shipping
                  </p>
                  <p className="font-body-md text-[13px] text-on-surface-variant">
                    Processing 1–2 business days, then 3–7 business days in transit.
                  </p>
                </div>
                <p className="whitespace-nowrap font-body-md text-body-md font-bold text-primary">
                  {formatPrice(computedShippingCents)}
                </p>
              </div>
              <p className="mt-2 font-body-md text-[12px] text-on-surface-variant">
                Rate is based on destination country. See our{' '}
                <Link href="/shipping-policy" className="underline underline-offset-2">
                  shipping policy
                </Link>
                .
              </p>
            </div>
          </FieldSet>

          <FieldSet legend="Discount code">
            {appliedDiscount ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-2 font-body-md text-body-md text-primary">
                  <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{appliedDiscount.code}</strong> — {appliedDiscount.message}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeDiscount}
                  aria-label="Remove discount code"
                  className="rounded-full p-1 text-on-surface-variant hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <label htmlFor="discount-code" className="sr-only">
                  Discount code
                </label>
                <input
                  id="discount-code"
                  type="text"
                  value={discountCode}
                  onChange={(e) => {
                    setDiscountCode(e.target.value)
                    setDiscountError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyDiscount()
                    }
                  }}
                  placeholder="Enter code"
                  className="min-w-0 flex-1 rounded-xl border border-outline bg-surface-container-lowest px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none"
                  aria-describedby={discountError ? 'discount-error' : undefined}
                />
                <button
                  type="button"
                  onClick={applyDiscount}
                  disabled={discountValidating || !discountCode.trim()}
                  className="flex items-center gap-2 rounded-xl bg-secondary px-5 py-3 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {discountValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    'Apply'
                  )}
                </button>
              </div>
            )}
            {discountError && (
              <p
                id="discount-error"
                role="alert"
                className="flex items-center gap-2 font-body-md text-[13px] text-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {discountError}
              </p>
            )}
          </FieldSet>
        </div>

        {/* Summary */}
        <aside className="h-fit rounded-2xl border border-outline-variant bg-surface-container-low p-6 lg:sticky lg:top-28">
          <h2 className="mb-6 font-headline-md text-headline-md text-primary">Order summary</h2>

          <ul className="mb-6 space-y-4">
            {items.map((i) => (
              <li key={i.key} className="flex gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                  {i.image_url && (
                    <Image src={i.image_url} alt="" fill sizes="64px" className="object-cover" />
                  )}
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                    {i.quantity}
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div>
                    <p className="font-body-md text-[13px] font-semibold text-on-surface">
                      {i.product_name}
                    </p>
                    <p className="font-body-md text-[12px] text-on-surface-variant">
                      {i.variant_label}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-body-md text-[13px] font-bold text-primary">
                    {formatPrice(i.unit_price_cents * i.quantity)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <dl className="space-y-3 border-t border-outline-variant pt-4">
            <div className="flex justify-between font-body-md text-body-md">
              <dt className="text-on-surface-variant">Subtotal</dt>
              <dd className="text-on-surface">{formatPrice(subtotalCents)}</dd>
            </div>
            {appliedDiscount && (
              <div className="flex justify-between font-body-md text-body-md text-primary">
                <dt className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  {appliedDiscount.code}
                </dt>
                <dd>−{formatPrice(discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between font-body-md text-body-md">
              <dt className="text-on-surface-variant">Shipping</dt>
              <dd className="text-on-surface">{formatPrice(computedShippingCents)}</dd>
            </div>
            <div className="flex justify-between font-body-md text-body-md">
              <dt className="text-on-surface-variant">HST ({rateConfig.tax_rate_percent}%)</dt>
              <dd className="text-on-surface">{formatPrice(taxCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-outline-variant pt-3 font-headline-md text-headline-md">
              <dt className="text-primary">Total</dt>
              <dd className="text-primary">{formatPrice(effectiveTotalCents)}</dd>
            </div>
          </dl>

          <p className="mt-4 rounded-xl bg-surface-container-lowest px-4 py-3 font-body-md text-[12px] text-on-surface-variant">
            You&apos;ll complete payment on Stripe&apos;s secure hosted page. Your card details
            never touch our servers.
          </p>

          <button
            type="submit"
            disabled={submitting || !ratesReady}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Preparing payment…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" aria-hidden="true" />
                Pay with Stripe
              </>
            )}
          </button>

          <p className="mt-4 text-center font-body-md text-[12px] text-on-surface-variant">
            All prices in {CURRENCY}. By placing this order you agree to our{' '}
            <Link href="/terms-of-service" className="underline underline-offset-2">
              terms
            </Link>
            .
          </p>
        </aside>
      </form>
    </div>
  )
}
