'use client'
import Link from 'next/link'
import AccountInvitation from '@/components/AccountInvitation'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { cancelBooking, getBookingConfirmation, type BookingConfirmation } from '@/lib/api/bookings'
import { formatPrice, formatDateLong, formatTime } from '@/lib/format'

function Confirmation() {
  const params = useSearchParams(),
    id = params.get('id'),
    token = params.get('token')
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
        if (result.status === 'pending' && ++attempts < 30) timer = setTimeout(check, 2000)
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : 'Could not load appointment.')
      }
    }
    void check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [id, token])
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
        {booking?.status === 'confirmed'
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
                {formatPrice(booking.deposit_cents)} ·{' '}
                {booking.status === 'confirmed' ? 'paid' : booking.status.replace('_', ' ')}
              </dd>
            </div>
          </dl>
          <p className="my-5" role="status">
            {booking.status === 'pending'
              ? 'We are waiting for verified deposit confirmation. Please check back shortly if you have paid.'
              : 'We will email you with confirmation and any cancellation or refund updates.'}
          </p>
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
