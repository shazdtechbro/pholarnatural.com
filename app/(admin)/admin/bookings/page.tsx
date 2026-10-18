'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Ban,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  List,
  Loader2,
} from 'lucide-react'
import {
  PageHeader,
  StatusBadge,
  TableWrap,
  Th,
  Td,
  Modal,
  AdminButton,
  EmptyState,
} from '@/components/admin/ui'
import { Field, TextareaField } from '@/components/FormField'
import { useToast } from '@/context/ToastContext'
import {
  listAdminBookings,
  cancelBookingAdmin,
  listAdminBlockedDates,
  blockDate,
  unblockDate,
  type AdminBooking,
  type AdminBlockedDate,
} from '@/lib/api/admin-bookings'
import { formatDateShort, formatDateLong, formatTime, formatPrice, toISODate } from '@/lib/format'
import { OPEN_WEEKDAYS } from '@/lib/config'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

type Filter = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'

/** Booking management (doc §1.14.4): calendar, list, confirm, cancel, and blocked dates. */
export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [blocked, setBlocked] = useState<AdminBlockedDate[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [period, setPeriod] = useState<'month' | 'week' | 'day'>('month')
  const [filter, setFilter] = useState<Filter>('all')
  const [cancelling, setCancelling] = useState<AdminBooking | null>(null)
  const [blockingOpen, setBlockingOpen] = useState(false)
  const { toast } = useToast()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const [cursor, setCursor] = useState(() => new Date(today))

  useEffect(() => {
    Promise.all([listAdminBookings(), listAdminBlockedDates()])
      .then(([bs, bds]) => {
        setBookings(bs)
        setBlocked(bds)
      })
      .catch(() => toast('Failed to load bookings', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  const visible = useMemo(
    () =>
      [...bookings]
        .filter(
          (b) =>
            filter === 'all' ||
            b.status === filter ||
            (filter === 'cancelled' && ['refunded', 'refund_pending'].includes(b.status)),
        )
        .sort(
          (a, b) =>
            b.booking_date.localeCompare(a.booking_date) ||
            a.start_time.localeCompare(b.start_time),
        ),
    [bookings, filter],
  )

  const byDate = useMemo(() => {
    const map = new Map<string, AdminBooking[]>()
    for (const b of bookings) {
      if (
        ['cancelled', 'refunded', 'refund_pending', 'payment_failed', 'expired'].includes(b.status)
      )
        continue
      const list = map.get(b.booking_date) ?? []
      list.push(b)
      map.set(b.booking_date, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time))
    return map
  }, [bookings])

  const blockedSet = useMemo(() => new Set(blocked.map((b) => b.date)), [blocked])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  if (period === 'month') {
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(year, month, d)))
  } else {
    const start = new Date(cursor)
    if (period === 'week') start.setDate(start.getDate() - start.getDay())
    for (let i = 0; i < (period === 'week' ? 7 : 1); i++)
      cells.push(toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  }
  const shift = (direction: number) =>
    setCursor(
      new Date(
        year,
        month + (period === 'month' ? direction : 0),
        period === 'month' ? 1 : cursor.getDate() + direction * (period === 'week' ? 7 : 1),
      ),
    )

  async function handleCancel(id: string, reason: string) {
    try {
      const response = await cancelBookingAdmin(id, reason)
      setBookings((bs) =>
        bs.map((b) =>
          b.id === id ? { ...b, status: response.status, cancellation_reason: reason } : b,
        ),
      )
      toast(response.refund_policy_message || 'Booking cancelled', 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel', 'error')
    }
  }

  async function handleBlockDate(dateStr: string, reason: string) {
    try {
      const bd = await blockDate(dateStr, reason || null)
      setBlocked((bs) => [...bs, bd])
      toast(`${formatDateShort(dateStr)} blocked out`)
      setBlockingOpen(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to block date', 'error')
    }
  }

  async function handleUnblock(id: string, dateStr: string) {
    try {
      await unblockDate(id)
      setBlocked((bs) => bs.filter((b) => b.id !== id))
      toast(`${formatDateShort(dateStr)} unblocked`, 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to unblock', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading bookings" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every appointment, and the dates you are closed."
        action={
          <div className="flex flex-wrap gap-2">
            <AdminButton variant="secondary" onClick={() => setBlockingOpen(true)}>
              <CalendarOff className="h-4 w-4" aria-hidden="true" />
              Block a date
            </AdminButton>
            <AdminButton
              variant={view === 'calendar' ? 'primary' : 'secondary'}
              onClick={() => setView(view === 'calendar' ? 'list' : 'calendar')}
            >
              {view === 'calendar' ? (
                <>
                  <List className="h-4 w-4" aria-hidden="true" />
                  List view
                </>
              ) : (
                <>
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Calendar view
                </>
              )}
            </AdminButton>
          </div>
        }
      />

      {view === 'calendar' ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:p-6">
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Calendar period">
            {(['month', 'week', 'day'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
                className={`rounded-full border px-4 py-2 capitalize ${period === value ? 'bg-primary text-white' : ''}`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={`Previous ${period}`}
              className="flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-surface-container-high"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h2 aria-live="polite" className="font-headline-md text-headline-md text-primary">
              {period === 'month' ? `${MONTHS[month]} ${year}` : formatDateLong(toISODate(cursor))}
            </h2>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label={`Next ${period}`}
              className="flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-surface-container-high"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <div
              className={
                period === 'day' ? 'grid grid-cols-1 gap-2' : 'grid min-w-[44rem] grid-cols-7 gap-2'
              }
            >
              {(period === 'day'
                ? [cursor.toLocaleDateString('en-CA', { weekday: 'long' })]
                : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              ).map((d) => (
                <div
                  key={d}
                  className="pb-2 text-center font-label-sm text-label-sm uppercase text-on-surface-variant"
                >
                  {d}
                </div>
              ))}

              {cells.map((iso, i) => {
                if (!iso) return <div key={`pad-${i}`} />
                const day = Number(iso.slice(-2))
                const dayBookings = byDate.get(iso) ?? []
                const weekday = new Date(iso + 'T12:00:00').getDay()
                const isClosed = !(OPEN_WEEKDAYS as readonly number[]).includes(weekday)
                const isBlocked = blockedSet.has(iso)
                const isToday = iso === toISODate(today)

                return (
                  <div
                    key={iso}
                    className={`min-h-24 rounded-xl border p-2 ${
                      isBlocked
                        ? 'border-error/30 bg-error-container/30'
                        : isClosed
                          ? 'border-outline-variant/40 bg-surface-container-low'
                          : 'border-outline-variant bg-surface-container-lowest'
                    } ${isToday ? 'ring-2 ring-primary' : ''}`}
                  >
                    <p className="mb-1 flex items-center justify-between font-label-sm text-label-sm">
                      <span className={isClosed || isBlocked ? 'text-outline' : 'text-on-surface'}>
                        {day}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-bold uppercase text-primary">Today</span>
                      )}
                    </p>

                    {isBlocked && (
                      <p className="font-label-sm text-[10px] uppercase text-on-error-container">
                        Closed
                      </p>
                    )}

                    <ul className="space-y-1">
                      {dayBookings.map((b) => (
                        <li
                          key={b.id}
                          className="truncate rounded bg-primary/10 px-1.5 py-1 font-body-md text-[11px] text-primary"
                          title={`${formatTime(b.start_time)} ${b.customer_name} — ${b.service_name}`}
                        >
                          {formatTime(b.start_time)} {b.customer_name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>

          {blocked.length > 0 && (
            <div className="mt-6 border-t border-outline-variant pt-4">
              <h3 className="mb-3 font-label-sm text-label-sm font-bold uppercase text-primary">
                Blocked dates
              </h3>
              <ul className="flex flex-wrap gap-2">
                {blocked.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-full bg-error-container px-3 py-1.5 font-body-md text-[13px] text-on-error-container"
                  >
                    {formatDateShort(b.date)} — {b.reason ?? 'Studio closed'}
                    <button
                      type="button"
                      onClick={() => handleUnblock(b.id, b.date)}
                      aria-label={`Unblock ${formatDateLong(b.date)}`}
                      className="rounded-full p-0.5 hover:bg-on-error-container/10"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Filter by status"
            className="mb-6 flex flex-wrap gap-2"
          >
            {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-2 font-label-sm text-label-sm capitalize transition-colors ${
                  filter === f
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No bookings"
              message="Nothing matches this filter."
            />
          ) : (
            <TableWrap caption="All bookings">
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Customer</Th>
                  <Th>Service</Th>
                  <Th>When</Th>
                  <Th>Deposit</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr key={b.id}>
                    <Td className="font-semibold text-primary">{b.reference}</Td>
                    <Td>
                      <span className="block font-semibold text-on-surface">{b.customer_name}</span>
                      <span className="block text-[12px]">{b.customer_email}</span>
                      {b.customer_phone && (
                        <span className="block text-[12px]">{b.customer_phone}</span>
                      )}
                    </Td>
                    <Td>{b.service_name}</Td>
                    <Td>
                      {formatDateShort(b.booking_date)}
                      <span className="block text-[12px]">
                        {formatTime(b.start_time)}–{formatTime(b.end_time)}
                      </span>
                    </Td>
                    <Td>{formatPrice(b.deposit_cents)}</Td>
                    <Td>
                      <StatusBadge status={b.status} />
                      {b.cancellation_reason && (
                        <span className="mt-1 block text-[11px] text-on-surface-variant">
                          {b.cancellation_reason}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        {b.status === 'pending' && (
                          <span className="text-[12px]">Awaiting deposit</span>
                        )}
                        {['pending', 'confirmed'].includes(b.status) && (
                          <button
                            type="button"
                            onClick={() => setCancelling(b)}
                            aria-label={`Cancel booking ${b.reference}`}
                            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                          >
                            <Ban className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}

      {cancelling && (
        <CancelDialog
          booking={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => {
            handleCancel(cancelling.id, reason)
            setCancelling(null)
          }}
        />
      )}

      {blockingOpen && (
        <BlockDateDialog onClose={() => setBlockingOpen(false)} onConfirm={handleBlockDate} />
      )}
    </>
  )
}

function CancelDialog({
  booking,
  onClose,
  onConfirm,
}: {
  booking: AdminBooking
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title={`Cancel ${booking.reference}?`}>
      <p className="mb-4 font-body-md text-body-md text-on-surface-variant">
        This cancels {booking.customer_name}&apos;s appointment on{' '}
        {formatDateLong(booking.booking_date)} at {formatTime(booking.start_time)}. A cancellation
        email is sent, and a refund is triggered where the policy allows one.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(reason.trim() || 'Cancelled by studio')
        }}
      >
        <TextareaField
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Shown to the customer in the cancellation email."
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <AdminButton type="submit" className="flex-1">
            Cancel booking
          </AdminButton>
          <AdminButton variant="secondary" className="flex-1" onClick={onClose}>
            Keep it
          </AdminButton>
        </div>
      </form>
    </Modal>
  )
}

function BlockDateDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void
  onConfirm: (date: string, reason: string) => void
}) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title="Block out a date">
      <p className="mb-4 font-body-md text-body-md text-on-surface-variant">
        Blocked dates are removed from the customer booking calendar. Existing bookings on that date
        are not cancelled automatically — cancel them individually first.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (date) onConfirm(date, reason.trim() || 'Studio closed')
        }}
        className="space-y-4"
      >
        <Field
          label="Date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Public holiday, supplier visit, …"
        />
        <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
          <AdminButton type="submit" className="flex-1">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Block date
          </AdminButton>
          <AdminButton variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </AdminButton>
        </div>
      </form>
    </Modal>
  )
}
