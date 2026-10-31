'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Receipt, DollarSign, CalendarDays, Package, Plus, Scissors } from 'lucide-react'
import { PageHeader, StatCard, StatusBadge, TableWrap, Th, Td, EmptyState } from '@/components/admin/ui'
import { getDashboardStats } from '@/lib/api/admin'
import type { DashboardStats } from '@/lib/api/admin'
import { formatPrice, formatDateShort, formatTime } from '@/lib/format'

/** Admin dashboard home (doc §1.14.1). Wired to GET /api/v1/admin/dashboard. */
export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'))
  }, [])

  if (error) {
    return (
      <div className="rounded-2xl bg-error-container p-6 font-body-md text-body-md text-on-error-container">
        {error}
      </div>
    )
  }

  if (!stats) {
    return (
      <div aria-busy="true" className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-full bg-surface-container-high" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-container-high" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today at a glance, plus what is coming up."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders today" value={String(stats.orders_today)} icon={Receipt} />
        <StatCard
          label="Revenue today"
          value={formatPrice(stats.revenue_today_cents)}
          icon={DollarSign}
        />
        <StatCard
          label="Bookings today"
          value={String(stats.bookings_today)}
          icon={CalendarDays}
        />
        <StatCard
          label="Revenue all time"
          value={formatPrice(stats.revenue_total_cents)}
          icon={DollarSign}
          hint="Across all recorded orders"
        />
      </div>

      {/* Quick actions (doc §1.14.1) */}
      <section className="mb-10">
        <h2 className="mb-4 font-headline-md text-headline-md text-primary">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Product
          </Link>
          <Link
            href="/admin/services"
            className="inline-flex items-center gap-2 rounded-full border border-outline px-5 py-2.5 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <Scissors className="h-4 w-4" aria-hidden="true" />
            Add Service
          </Link>
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-2 rounded-full border border-outline px-5 py-2.5 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            View Calendar
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-headline-md text-headline-md text-primary">Recent orders</h2>
            <Link href="/admin/orders" className="font-label-sm text-label-sm text-primary underline underline-offset-4">
              View all
            </Link>
          </div>

          {stats.recent_orders.length === 0 ? (
            <EmptyState icon={Package} title="No orders yet" message="Orders will appear here as they come in." />
          ) : (
            <TableWrap caption="The ten most recent orders">
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <Link href="/admin/orders" className="font-semibold text-primary hover:underline">
                        {o.order_number}
                      </Link>
                      <span className="block text-[12px]">{formatDateShort(o.created_at.slice(0, 10))}</span>
                    </Td>
                    <Td>{o.customer_name}</Td>
                    <Td className="font-semibold text-on-surface">{formatPrice(o.total_cents, o.currency)}</Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-headline-md text-headline-md text-primary">Upcoming bookings</h2>
            <Link href="/admin/bookings" className="font-label-sm text-label-sm text-primary underline underline-offset-4">
              View all
            </Link>
          </div>

          {stats.upcoming_bookings.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing booked"
              message="Upcoming appointments will show up here."
            />
          ) : (
            <TableWrap caption="Upcoming appointments">
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Service</Th>
                  <Th>When</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {stats.upcoming_bookings.map((b) => (
                  <tr key={b.id}>
                    <Td className="font-semibold text-on-surface">{b.customer_name}</Td>
                    <Td>{b.service_name}</Td>
                    <Td>
                      {formatDateShort(b.booking_date)}
                      <span className="block text-[12px]">{formatTime(b.start_time)}</span>
                    </Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </section>
      </div>
    </>
  )
}
