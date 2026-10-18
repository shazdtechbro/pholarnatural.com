'use client'

import { useEffect, useMemo, useState } from 'react'
import { Receipt, Eye, Loader2 } from 'lucide-react'
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
import { useToast } from '@/context/ToastContext'
import { listAdminOrders, updateOrderStatus, type AdminOrder } from '@/lib/api/admin-orders'
import { formatPrice, formatDateShort, formatDateLong } from '@/lib/format'

/** The fulfilment pipeline, in order (doc §1.14.5). */
const STATUS_FLOW = ['paid', 'confirmed', 'processing', 'shipped', 'delivered'] as const
type Filter = string

const availableStatuses = (status: string) => [
  status,
  ...((
    {
      pending: ['cancelled'],
      paid: ['confirmed', 'processing', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
    } as Record<string, string[]>
  )[status] ?? []),
]

/** Order management (doc §1.14.5). */
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [viewing, setViewing] = useState<AdminOrder | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    listAdminOrders()
      .then(setOrders)
      .catch(() => toast('Failed to load orders', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  const visible = useMemo(
    () =>
      [...orders]
        .filter((o) => filter === 'all' || o.status === filter)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [orders, filter],
  )

  async function setStatus(order: AdminOrder, newStatus: string) {
    if (newStatus === order.status) return
    if (
      newStatus === 'cancelled' &&
      !window.confirm('Cancel this order? Any captured payment will be refunded.')
    )
      return
    setUpdating(order.id)
    try {
      const response = await updateOrderStatus(order.id, newStatus)
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: response.status } : o)))
      setViewing((v) => (v?.id === order.id ? { ...v, status: response.status } : v))
      toast(`${order.order_number} → ${response.status}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const filterOptions: Filter[] = [
    'all',
    'pending',
    ...STATUS_FLOW,
    'cancelled',
    'refund_pending',
    'refunded',
    'expired',
  ]

  return (
    <>
      <PageHeader title="Orders" description="Track and fulfil customer orders." />

      <div role="radiogroup" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {filterOptions.map((f) => (
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading orders" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Receipt} title="No orders" message="Nothing matches this filter." />
      ) : (
        <TableWrap caption="All orders">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th>Total</Th>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id}>
                <Td className="font-semibold text-primary">{o.order_number}</Td>
                <Td>
                  <span className="block font-semibold text-on-surface">{o.customer_name}</span>
                  <span className="block text-[12px]">{o.customer_email}</span>
                </Td>
                <Td>{o.items.reduce((s, i) => s + i.quantity, 0)}</Td>
                <Td className="font-semibold text-on-surface">{formatPrice(o.total_cents)}</Td>
                <Td>{formatDateShort(o.created_at.slice(0, 10))}</Td>
                <Td>
                  <select
                    value={o.status}
                    disabled={updating === o.id}
                    onChange={(e) => setStatus(o, e.target.value)}
                    aria-label={`Status for order ${o.order_number}`}
                    className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-label-sm text-[13px] capitalize text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
                  >
                    {availableStatuses(o.status).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => setViewing(o)}
                    aria-label={`View order ${o.order_number}`}
                    className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {viewing && (
        <OrderModal
          order={viewing}
          onClose={() => setViewing(null)}
          onSetStatus={(s) => setStatus(viewing, s)}
          updating={updating === viewing.id}
        />
      )}
    </>
  )
}

function OrderModal({
  order,
  onClose,
  onSetStatus,
  updating,
}: {
  order: AdminOrder
  onClose: () => void
  onSetStatus: (status: string) => void
  updating: boolean
}) {
  const [selectedStatus, setSelectedStatus] = useState(order.status)
  const chosenStatus = availableStatuses(order.status).includes(selectedStatus)
    ? selectedStatus
    : order.status
  const addr = order.shipping_address

  return (
    <Modal open onClose={onClose} title={`Order ${order.order_number}`} wide>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={order.status} />
          <p className="font-body-md text-[13px] text-on-surface-variant">
            Placed {formatDateLong(order.created_at.slice(0, 10))}
          </p>
        </div>

        <section>
          <h3 className="mb-3 font-label-sm text-label-sm font-bold uppercase text-primary">
            Items
          </h3>
          <ul className="divide-y divide-outline-variant">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-body-md text-body-md font-semibold text-on-surface">
                    {item.product_name}
                  </p>
                  <p className="font-body-md text-[12px] text-on-surface-variant">
                    {item.variant_label ?? '—'} · Qty {item.quantity}
                  </p>
                </div>
                <p className="shrink-0 font-body-md text-body-md font-bold text-primary">
                  {formatPrice(item.unit_price_cents * item.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 font-label-sm text-label-sm font-bold uppercase text-primary">
              Shipping address
            </h3>
            <address className="font-body-md text-body-md not-italic text-on-surface-variant">
              <span className="block font-semibold text-on-surface">{addr.full_name}</span>
              <span className="block">{addr.address_line1}</span>
              {addr.address_line2 && <span className="block">{addr.address_line2}</span>}
              <span className="block">
                {addr.city}, {addr.province} {addr.postal_code}
              </span>
              <span className="block">{addr.country}</span>
            </address>
          </div>

          <div>
            <h3 className="mb-3 font-label-sm text-label-sm font-bold uppercase text-primary">
              Payment
            </h3>
            <dl className="space-y-2 font-body-md text-body-md">
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Subtotal</dt>
                <dd className="text-on-surface">{formatPrice(order.subtotal_cents)}</dd>
              </div>
              {order.discount_cents > 0 && (
                <div className="flex justify-between text-primary">
                  <dt>Discount</dt>
                  <dd>−{formatPrice(order.discount_cents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Shipping</dt>
                <dd className="text-on-surface">
                  {order.shipping_cents === 0 ? 'Free' : formatPrice(order.shipping_cents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd>{formatPrice(order.tax_cents ?? 0)}</dd>
              </div>
              <div className="flex justify-between border-t border-outline-variant pt-2 font-semibold">
                <dt className="text-primary">Total</dt>
                <dd className="text-primary">{formatPrice(order.total_cents)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Status update (doc §1.14.5) */}
        <section className="border-t border-outline-variant pt-4">
          <h3 className="mb-3 font-label-sm text-label-sm font-bold uppercase text-primary">
            Update status
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={chosenStatus}
              disabled={updating}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="flex-1 rounded-xl border border-outline bg-surface-container-lowest px-4 py-3 font-body-md text-body-md capitalize text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
            >
              {availableStatuses(order.status).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <AdminButton
              onClick={() => onSetStatus(chosenStatus)}
              disabled={updating || chosenStatus === order.status}
              className="shrink-0"
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Save'}
            </AdminButton>
          </div>
          <p className="mt-2 font-body-md text-[12px] text-on-surface-variant">
            Changing to <strong>confirmed</strong>, <strong>processing</strong>,{' '}
            <strong>shipped</strong>, or <strong>delivered</strong> sends the customer an email.
          </p>
        </section>
      </div>
    </Modal>
  )
}
