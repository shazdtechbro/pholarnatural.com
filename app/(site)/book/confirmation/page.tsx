'use client'
import Link from 'next/link'
import AccountInvitation from '@/components/AccountInvitation'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { cancelBooking, getBookingConfirmation, payBookingBalance, type BookingConfirmation } from '@/lib/api/bookings'
import { formatPrice, formatDateLong, formatTime } from '@/lib/format'

function Confirmation() {
  const params = useSearchParams(),
    id = params.get('id'),
    token = params.get('token'),
    balanceReturn = params.get('balance_return') === '1',
    balanceCancelled = params.get('balance_cancelled') === '1'
  const [booking, setBooking] = useState<BookingConfirmation | null>(null)
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!id || !token) return
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      attempts = 0
    async function check() {
      try {
        const result = await getBookingConfirmation(id!, token!)
        if (stopped) return
        setBooking(result)
        if ((result.status === 'pending' || (balanceReturn && result.balance_status === 'due')) && ++attempts < 30) timer = setTimeout(check, 2000)
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : 'Could not load appointment.')
      }
    }
    void check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [id, token, balanceReturn])
  async function payBalance() {
    if (!booking || !token || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await payBookingBalance(booking.id, token)
      if (result.fully_paid) {
        setBooking(await getBookingConfirmation(booking.id, token))
      } else if (result.checkout_url) {
        const destination = new URL(result.checkout_url)
        if (destination.protocol !== 'https:' || !['sandbox-checkout.bachs.io', 'checkout.bachs.io'].includes(destination.hostname)) throw new Error('Payment link could not be verified. Please contact us.')
        window.location.assign(destination.href)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open payment. Your booking and deposit are preserved; please retry.')
    } finally { setBusy(false) }
  }
  async function cancel() {
    if (
      !booking ||
      !token ||
      !window.confirm('Cancel this appointment? Refund eligibility is shown after cancellation.')
    )
      return
    setBusy(true)
    setError('')
    try {
      const result = await cancelBooking(booking.id, 'Customer requested cancellation', token)
      setBooking({ ...booking, status: result.status })
      setMessage(result.refund_policy_message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel appointment.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-headline-lg text-headline-lg-mobile text-primary">
        {booking?.balance_status === 'paid' ? 'Your service is fully paid' : booking?.status === 'completed' ? 'Your service is complete' : booking?.status === 'confirmed'
          ? 'Your appointment is confirmed'
          : booking
            ? `Appointment ${booking.status.replace('_', ' ')}`
            : 'Appointment details'}
      </h1>
      {!id || !token ? (
        <p className="my-5">
          Open your appointment using the confirmation link from checkout or your email.
        </p>
      ) : !booking && !error ? (
        <p role="status">Checking your deposit…</p>
      ) : null}
      {error && (
        <p role="alert" className="my-4 text-error">
          {error}
        </p>
      )}
      {booking && (
        <>
          <p className="my-4">Reference {booking.reference}</p>
          <dl className="space-y-4 rounded-xl border p-5">
            <div>
              <dt>Service</dt>
              <dd>{booking.service_name}</dd>
            </div>
            <div>
              <dt>Date and time</dt>
              <dd>
                {formatDateLong(booking.booking_date)} · {formatTime(booking.start_time)}–
                {formatTime(booking.end_time)}
              </dd>
            </div>
            <div>
              <dt>Deposit</dt>
              <dd>
                {formatPrice(booking.deposit_cents, booking.currency)} ·{' '}
                {booking.deposit_paid_cents > 0 ? 'paid' : booking.status.replace('_', ' ')}
              </dd>
            </div>
            {booking.total_price_cents != null && <div><dt>Original service price</dt><dd>{formatPrice(booking.total_price_cents, booking.currency)}</dd></div>}
            {booking.balance_paid_cents > 0 && <div><dt>Balance payments received</dt><dd>{formatPrice(booking.balance_paid_cents, booking.currency)}</dd></div>}
            {booking.balance_due_cents != null && <div className="border-t pt-4 font-semibold text-primary"><dt>Remaining balance</dt><dd>{formatPrice(booking.balance_due_cents, booking.currency)}</dd></div>}
          </dl>
          <p className="my-5" role="status">
            {booking.balance_status === 'paid' ? 'Your deposit and remaining balance have been verified. Your receipt has been emailed to you.' : booking.balance_status === 'review_required' ? 'This payment needs review. Please contact the studio before making any further payment.' : booking.status === 'completed' ? (balanceReturn ? 'We are checking your payment. This page updates only after verification. You can refresh to check again; please do not pay again if you have already paid.' : balanceCancelled ? 'Checkout was closed. Your deposit is still recorded. You can retry the remaining payment below.' : 'Your deposit has been deducted. Pay only the remaining amount below.') : booking.status === 'pending'
              ? 'We are waiting for verified deposit confirmation. Please check back shortly if you have paid.'
              : 'We will email you with confirmation and any cancellation or refund updates.'}
          </p>
          {booking.status === 'completed' && booking.balance_status === 'due' && (booking.balance_due_cents ?? 0) > 0 && <button type="button" disabled={busy} onClick={payBalance} className="mb-6 rounded-full bg-primary px-6 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Opening secure payment…' : `Pay remaining ${formatPrice(booking.balance_due_cents!, booking.currency)}`}</button>}
          {balanceReturn && booking.balance_status === 'due' && token && <button type="button" disabled={busy} className="mb-6 ml-3 rounded-full border px-5 py-3" onClick={async () => { setBusy(true); try { setBooking(await getBookingConfirmation(booking.id, token)); setError('') } catch { setError('Could not check payment. Please try again.') } finally { setBusy(false) } }}>Check payment status</button>}
          {message && (
            <p className="my-4" role="status">
              {message}
            </p>
          )}
          {['confirmed', 'pending'].includes(booking.status) && (
            <button disabled={busy} onClick={cancel} className="my-5 rounded-full border px-5 py-3">
              {busy ? 'Cancelling…' : 'Cancel appointment'}
            </button>
          )}
        </>
      )}
      <p>
        <Link href="/book" className="underline">
          Book another appointment
        </Link>{' '}
        ·{' '}
        <Link href="/contact" className="underline">
          Contact us
        </Link>
      </p>
      <AccountInvitation />
    </section>
  )
}
export default function BookingConfirmationPage() {
  return (
    <Suspense fallback={<p>Loading appointment…</p>}>
      <Confirmation />
    </Suspense>
  )
}
