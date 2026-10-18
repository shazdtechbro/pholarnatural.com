import type { Metadata } from 'next'
import { Suspense } from 'react'
import BookingFlow from '@/components/BookingFlow'
import { getServices } from '@/lib/api/services'
import { getBlockedDates } from '@/lib/api/bookings'

export const metadata: Metadata = {
  title: 'Book an Appointment',
  description:
    'Book French Braids, Cornrows, Cornrow Mix Twist, Natural Twist, Wash and Blow Dry, Hair Treatment or Hair Waxing at Pholar Natural. Monday to Saturday, 10:00 AM to 5:00 PM, held with a 10% deposit.',
  alternates: { canonical: '/book' },
  openGraph: {
    title: 'Book an Appointment | Pholar Natural',
    description: 'Choose a service, date and time. Held with a 10% deposit.',
    url: '/book',
  },
}

export default async function BookPage() {
  const [services, blockedDates] = await Promise.all([getServices(), getBlockedDates()])

  return (
    /*
     * `BookingFlow` reads the `?service=` query with `useSearchParams`, which opts the subtree
     * into client-side rendering. The Suspense boundary is required — without it the whole route
     * would be forced dynamic.
     */
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-5 py-24 md:px-16" aria-busy="true">
          <div className="mx-auto h-10 w-64 animate-pulse rounded-full bg-surface-container-low" />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-container-low" />
            ))}
          </div>
        </div>
      }
    >
      <BookingFlow services={services} blockedDates={blockedDates} />
    </Suspense>
  )
}
