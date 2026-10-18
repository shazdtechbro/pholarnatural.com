'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, TicketPercent, Loader2 } from 'lucide-react'
import {
  PageHeader,
  StatusBadge,
  TableWrap,
  Th,
  Td,
  Modal,
  ConfirmDialog,
  AdminButton,
  EmptyState,
} from '@/components/admin/ui'
import { Field } from '@/components/FormField'
import { useToast } from '@/context/ToastContext'
import {
  listAdminDiscounts,
  createAdminDiscount,
  updateAdminDiscount,
  deleteAdminDiscount,
  type AdminDiscount,
  type DiscountCreatePayload,
} from '@/lib/api/admin-discounts'
import { formatPrice, formatDateShort } from '@/lib/format'

/** Discount management (doc §1.14.6). */
export default function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState<AdminDiscount[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminDiscount | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AdminDiscount | null>(null)
  const [saving, setSaving] = useState(false)
  const [, setConfirmLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    listAdminDiscounts()
      .then(setDiscounts)
      .catch(() => toast('Failed to load discounts', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  const closeForm = () => {
    setEditing(null)
    setCreating(false)
  }

  const effectiveStatus = (d: AdminDiscount) => {
    if (!d.is_active) return 'draft'
    if (d.expires_at && new Date(d.expires_at) < new Date()) return 'expired'
    if (d.max_uses !== null && d.used_count >= d.max_uses) return 'expired'
    return 'active'
  }

  const describeValue = (d: AdminDiscount) =>
    d.discount_type === 'percentage' ? `${d.value}% off` : `${formatPrice(d.value)} off`

  async function handleSave(payload: DiscountCreatePayload, id?: string) {
    setSaving(true)
    try {
      if (id) {
        const updated = await updateAdminDiscount(id, payload)
        setDiscounts((ds) => ds.map((d) => (d.id === id ? updated : d)))
        toast(`${updated.code} updated`)
      } else {
        const created = await createAdminDiscount(payload)
        setDiscounts((ds) => [...ds, created])
        toast(`${created.code} created`)
      }
      closeForm()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setConfirmLoading(true)
    try {
      await deleteAdminDiscount(deleting.id)
      setDiscounts((ds) => ds.filter((d) => d.id !== deleting.id))
      toast(`${deleting.code} deleted`, 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setConfirmLoading(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Promo codes, their limits and how often they have been used."
        action={
          <AdminButton onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create Discount
          </AdminButton>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading discounts" />
        </div>
      ) : discounts.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No discount codes"
          message="Create a code to run your first promotion."
        />
      ) : (
        <TableWrap caption="All discount codes">
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Type</Th>
              <Th>Value</Th>
              <Th>Usage</Th>
              <Th>Min order</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d.id}>
                <Td>
                  <code className="rounded bg-surface-container-high px-2 py-1 font-mono text-[13px] font-bold text-primary">
                    {d.code}
                  </code>
                </Td>
                <Td className="capitalize">{d.discount_type}</Td>
                <Td className="font-semibold text-on-surface">{describeValue(d)}</Td>
                <Td>
                  {d.max_uses === null ? (
                    <span>
                      {d.used_count} / <span className="text-on-surface-variant">∞</span>
                    </span>
                  ) : (
                    <>
                      {d.used_count} / {d.max_uses}
                      <span
                        className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-surface-container-highest"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={d.max_uses}
                        aria-valuenow={d.used_count}
                        aria-label={`${d.code} usage`}
                      >
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (d.used_count / d.max_uses) * 100)}%` }}
                        />
                      </span>
                    </>
                  )}
                </Td>
                <Td>{d.min_order_cents ? formatPrice(d.min_order_cents) : '—'}</Td>
                <Td>{d.expires_at ? formatDateShort(d.expires_at.slice(0, 10)) : '—'}</Td>
                <Td>
                  <StatusBadge status={effectiveStatus(d)} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(d)}
                      aria-label={`Edit ${d.code}`}
                      className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(d)}
                      aria-label={`Delete ${d.code}`}
                      className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {(creating || editing) && (
        <DiscountForm
          key={editing?.id ?? 'new'}
          discount={editing}
          saving={saving}
          onClose={closeForm}
          onSave={(payload) => handleSave(payload, editing?.id)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.code}?`}
        message="Customers who try this code will be told it is invalid. This cannot be undone."
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}

interface DiscountFormValues {
  code: string
  discount_type: 'percentage' | 'fixed'
  value: number
  max_uses: string
  min_order_cents: string
  expires_at: string
  is_active: boolean
}

function DiscountForm({
  discount,
  saving,
  onClose,
  onSave,
}: {
  discount: AdminDiscount | null
  saving: boolean
  onClose: () => void
  onSave: (payload: DiscountCreatePayload) => void
}) {
  const [values, setValues] = useState<DiscountFormValues>(() =>
    discount
      ? {
          code: discount.code,
          discount_type: discount.discount_type,
          value: discount.value,
          max_uses: discount.max_uses !== null ? String(discount.max_uses) : '',
          min_order_cents:
            discount.min_order_cents !== null ? String(discount.min_order_cents) : '',
          expires_at: discount.expires_at ? discount.expires_at.slice(0, 10) : '',
          is_active: discount.is_active,
        }
      : {
          code: '',
          discount_type: 'percentage',
          value: 10,
          max_uses: '100',
          min_order_cents: '',
          expires_at: '',
          is_active: true,
        },
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload: DiscountCreatePayload = {
      code: values.code,
      discount_type: values.discount_type,
      value: values.value,
      max_uses: values.max_uses ? Number(values.max_uses) : null,
      min_order_cents: values.min_order_cents ? Number(values.min_order_cents) : null,
      expires_at: values.expires_at ? `${values.expires_at}T23:59:59Z` : null,
      is_active: values.is_active,
    }
    onSave(payload)
  }

  return (
    <Modal open onClose={onClose} title={discount ? `Edit ${discount.code}` : 'Create discount'}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Code"
          required
          hint="Customers type this at checkout. Uppercase, no spaces."
          value={values.code}
          onChange={(e) =>
            setValues((v) => ({ ...v, code: e.target.value.toUpperCase().replace(/\s/g, '') }))
          }
        />

        <div>
          <label
            htmlFor="discount-type"
            className="mb-1.5 block font-label-sm text-label-sm font-semibold text-on-surface"
          >
            Type
          </label>
          <select
            id="discount-type"
            value={values.discount_type}
            onChange={(e) =>
              setValues((v) => ({ ...v, discount_type: e.target.value as 'percentage' | 'fixed' }))
            }
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-md text-body-md"
          >
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </div>

        <Field
          label={values.discount_type === 'percentage' ? 'Percentage' : 'Amount (cents)'}
          type="number"
          required
          min={1}
          max={values.discount_type === 'percentage' ? 100 : undefined}
          value={values.value}
          hint={
            values.discount_type === 'percentage'
              ? `${values.value}% off the order`
              : `${formatPrice(values.value)} off the order`
          }
          onChange={(e) => setValues((v) => ({ ...v, value: Number(e.target.value) }))}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Max uses"
            type="number"
            min={1}
            value={values.max_uses}
            hint={values.max_uses ? undefined : 'Leave blank for unlimited'}
            onChange={(e) => setValues((v) => ({ ...v, max_uses: e.target.value }))}
          />
          <Field
            label="Min order (cents)"
            type="number"
            min={0}
            value={values.min_order_cents}
            hint={
              values.min_order_cents
                ? formatPrice(Number(values.min_order_cents))
                : 'Leave blank for no minimum'
            }
            onChange={(e) => setValues((v) => ({ ...v, min_order_cents: e.target.value }))}
          />
        </div>

        <Field
          label="Expires on"
          type="date"
          value={values.expires_at}
          hint={values.expires_at ? undefined : 'Leave blank for no expiry'}
          onChange={(e) => setValues((v) => ({ ...v, expires_at: e.target.value }))}
        />

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={values.is_active}
            onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
            className="h-4 w-4 rounded border-outline accent-primary"
          />
          <span className="font-body-md text-body-md text-on-surface">Active</span>
        </label>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
          <AdminButton type="submit" disabled={saving} className="flex-1">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : discount ? (
              'Save changes'
            ) : (
              'Create discount'
            )}
          </AdminButton>
          <AdminButton variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
        </div>
      </form>
    </Modal>
  )
}
