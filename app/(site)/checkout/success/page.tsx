'use client'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getOrderConfirmation, type ConfirmedOrder } from '@/lib/api/orders'
import { useCart } from '@/context/CartContext'
import { formatPrice } from '@/lib/format'

function OrderConfirmation() {
  const params = useSearchParams(),
    id = params.get('id'),
    token = params.get('token')
  const [order, setOrder] = useState<ConfirmedOrder | null>(null)
  const [error, setError] = useState('')
  const { completeCheckout } = useCart()
  useEffect(() => {
    if (!id || !token) return
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>,
      attempts = 0
    async function check() {
      try {
        const record = await getOrderConfirmation(id!, token!)
        if (cancelled) return
        setOrder(record)
        if (['paid', 'confirmed', 'processing', 'shipped', 'delivered'].includes(record.status))
          completeCheckout(record.id)
        else if (record.status === 'pending' && ++attempts < 30) timer = setTimeout(check, 2000)
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : 'Could not verify payment. Please contact us.',
          )
      }
    }
    void check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, token, completeCheckout])
  if (!id || !token)
    return (
      <section className="mx-auto max-w-xl px-5 py-20">
        <h1 className="text-headline-md">No order confirmation link</h1>
        <p className="my-5">
          Return here using your checkout confirmation link. Your payment has not been verified on
          this page.
        </p>
        <Link href="/cart">Return to cart</Link>
      </section>
    )
  if (error)
    return (
      <section className="mx-auto max-w-xl px-5 py-20" role="alert">
        <h1>We could not verify this order</h1>
        <p>{error}</p>
        <Link href="/contact">Contact us</Link>
      </section>
    )
  if (!order)
    return (
      <p className="px-5 py-20" role="status">
        Checking your payment…
      </p>
    )
  const paid = ['paid', 'confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)
  return (
    <section className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-headline-lg text-headline-lg-mobile text-primary">
        {paid
          ? 'Thank you for your order'
          : order.status === 'pending'
            ? 'Waiting for payment confirmation'
            : `Order ${order.status.replace('_', ' ')}`}
      </h1>
      <p className="my-4" role="status">
        Reference {order.order_number}.{' '}
        {paid
          ? 'Your payment is verified. We will email your receipt and order updates.'
          : 'This page reflects the latest verified payment status. If you paid recently, please check back shortly or contact us.'}
      </p>
      <ul className="my-8 space-y-4">
        {order.items.map((i) => (
          <li key={i.id} className="flex flex-wrap justify-between gap-2">
            <span>
              {i.product_name} · {i.variant_label} × {i.quantity}
            </span>
            <strong>{formatPrice(i.quantity * i.unit_price_cents)}</strong>
          </li>
        ))}
      </ul>
      <dl className="space-y-3 border-t py-5">
        {[
          ['Subtotal', order.subtotal_cents],
          ['Discount', -order.discount_cents],
          ['Shipping', order.shipping_cents],
          ['Tax', order.tax_cents],
          ['Total', order.total_cents],
        ].map(([label, amount]) => (
          <div className="flex justify-between" key={label}>
            <dt>{label}</dt>
            <dd>{formatPrice(Number(amount))}</dd>
          </div>
        ))}
      </dl>
      <h2 className="font-bold">Shipping address</h2>
      <address className="my-4 not-italic">
        {Object.values(order.shipping_address).filter(Boolean).join(', ')}
      </address>
      <p className="my-4">
        Orders are processed in 1–2 business days. We will email you when the parcel is dispatched.
      </p>
      <Link href="/shop" className="underline">
        Continue shopping
      </Link>
    </section>
  )
}
export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<p>Checking your order…</p>}>
      <OrderConfirmation />
    </Suspense>
  )
}
