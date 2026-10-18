'use client'

import { uploadSettingsImage } from '@/lib/api/admin-settings'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Scissors, Loader2 } from 'lucide-react'
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
import { Field, TextareaField } from '@/components/FormField'
import { useToast } from '@/context/ToastContext'
import { formatPrice, formatDuration } from '@/lib/format'
import {
  listAdminServices,
  createAdminService,
  updateAdminService,
  deleteAdminService,
  type AdminService,
} from '@/lib/api/admin-services'

interface ServiceFormValues {
  image_url: string
  long_description: string
  what_to_expect: string[]
  name: string
  slug: string
  description: string
  duration_minutes: number
  price_cents: number
  is_active: boolean
}

/** Service management (doc §1.14.3). */
export default function AdminServicesPage() {
  const [services, setServices] = useState<AdminService[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminService | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AdminService | null>(null)
  const [saving, setSaving] = useState(false)
  const [, setConfirmLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    listAdminServices()
      .then(setServices)
      .catch(() => toast('Failed to load services', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  const closeForm = () => {
    setEditing(null)
    setCreating(false)
  }

  async function handleSave(values: ServiceFormValues) {
    setSaving(true)
    try {
      if (editing) {
        const updated = await updateAdminService(editing.id, {
          name: values.name,
          slug: values.slug || undefined,
          description: values.description || null,
          image_url: values.image_url || null,
          long_description: values.long_description,
          what_to_expect: values.what_to_expect.filter(Boolean),
          duration_minutes: values.duration_minutes,
          price_cents: values.price_cents,
          is_active: values.is_active,
        })
        setServices((ss) => ss.map((s) => (s.id === editing.id ? updated : s)))
        toast(`${updated.name} updated`)
      } else {
        const created = await createAdminService({
          name: values.name,
          description: values.description || null,
          image_url: values.image_url || null,
          long_description: values.long_description,
          what_to_expect: values.what_to_expect.filter(Boolean),
          duration_minutes: values.duration_minutes,
          price_cents: values.price_cents,
          is_active: values.is_active,
        })
        setServices((ss) => [...ss, created])
        toast(`${created.name} created`)
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
      await deleteAdminService(deleting.id)
      setServices((ss) => ss.filter((s) => s.id !== deleting.id))
      toast(`${deleting.name} deleted`, 'info')
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
        title="Services"
        description="Manage the treatment menu, durations and pricing."
        action={
          <AdminButton onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Service
          </AdminButton>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading services" />
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No services"
          message="Add a service to open up bookings."
        />
      ) : (
        <TableWrap caption="All services">
          <thead>
            <tr>
              <Th>Service</Th>
              <Th>Duration</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    {s.image_url ? (
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                        <Image
                          src={s.image_url}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                        <Scissors className="h-5 w-5 text-outline" aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <span className="block font-semibold text-on-surface">{s.name}</span>
                      {s.description && (
                        <span className="block max-w-xs truncate text-[12px] text-on-surface-variant">
                          {s.description}
                        </span>
                      )}
                    </div>
                  </div>
                </Td>
                <Td>{formatDuration(s.duration_minutes)}</Td>
                <Td className="font-semibold text-on-surface">{formatPrice(s.price_cents)}</Td>
                <Td>
                  <StatusBadge status={s.is_active ? 'active' : 'draft'} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      aria-label={`Edit ${s.name}`}
                      className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(s)}
                      aria-label={`Delete ${s.name}`}
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
        <ServiceForm
          key={editing?.id ?? 'new'}
          service={editing}
          saving={saving}
          onClose={closeForm}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name}?`}
        message="This removes the service from the booking flow and the services page. Services with upcoming bookings cannot be deleted — cancel those bookings first."
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}

function ServiceForm({
  service,
  saving,
  onClose,
  onSave,
}: {
  service: AdminService | null
  saving: boolean
  onClose: () => void
  onSave: (values: ServiceFormValues) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [values, setValues] = useState<ServiceFormValues>(() =>
    service
      ? {
          name: service.name,
          image_url: service.image_url ?? '',
          long_description: service.long_description ?? '',
          what_to_expect: service.what_to_expect ?? [],
          slug: service.slug,
          description: service.description ?? '',
          duration_minutes: service.duration_minutes,
          price_cents: service.price_cents,
          is_active: service.is_active,
        }
      : {
          image_url: '',
          long_description: '',
          what_to_expect: [],
          name: '',
          slug: '',
          description: '',
          duration_minutes: 60,
          price_cents: 0,
          is_active: true,
        },
  )

  return (
    <Modal open onClose={onClose} title={service ? `Edit ${service.name}` : 'Add service'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(values)
        }}
        className="space-y-4"
      >
        <Field
          label="Name"
          required
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
        {service && (
          <Field
            label="URL slug"
            value={values.slug}
            onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
          />
        )}
        <TextareaField
          label="Description"
          rows={3}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
        <Field
          label="Image URL"
          value={values.image_url}
          onChange={(e) => setValues((v) => ({ ...v, image_url: e.target.value }))}
        />
        <label className="block">
          Upload service photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploading(true)
              setImageError('')
              try {
                const url = await uploadSettingsImage(file)
                setValues((v) => ({ ...v, image_url: url }))
              } catch {
                setImageError('Could not upload the service image. Please try again.')
              } finally {
                setUploading(false)
              }
            }}
          />
        </label>
        {imageError && <p role="alert">{imageError}</p>}
        <TextareaField
          label="Full service description"
          value={values.long_description}
          onChange={(e) => setValues((v) => ({ ...v, long_description: e.target.value }))}
        />
        <TextareaField
          label="What to expect (one item per line)"
          value={values.what_to_expect.join('\n')}
          onChange={(e) => setValues((v) => ({ ...v, what_to_expect: e.target.value.split('\n') }))}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Duration (minutes)"
            type="number"
            required
            min={15}
            step={15}
            value={values.duration_minutes}
            hint={formatDuration(values.duration_minutes)}
            onChange={(e) => setValues((v) => ({ ...v, duration_minutes: Number(e.target.value) }))}
          />
          <Field
            label="Price (cents)"
            type="number"
            required
            min={0}
            value={values.price_cents}
            hint={formatPrice(values.price_cents)}
            onChange={(e) => setValues((v) => ({ ...v, price_cents: Number(e.target.value) }))}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={values.is_active}
            onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
            className="h-4 w-4 rounded border-outline accent-primary"
          />
          <span className="font-body-md text-body-md text-on-surface">
            Active (visible in booking flow)
          </span>
        </label>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
          <AdminButton type="submit" disabled={saving || uploading} className="flex-1">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : service ? (
              'Save changes'
            ) : (
              'Create service'
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
