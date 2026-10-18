'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Package, ImageUp, X, Loader2, AlertCircle } from 'lucide-react'
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
import { formatPrice } from '@/lib/format'
import {
  listAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  addVariant,
  updateVariant,
  deleteVariant,
  uploadProductImage,
  reorderProductImages,
  deleteProductImage,
} from '@/lib/api/admin-products'
import type { AdminProduct, AdminProductVariant, AdminProductImage } from '@/lib/api/admin-products'

function totalStock(p: AdminProduct) {
  return p.variants.reduce((s, v) => s + v.stock_count, 0)
}

/** Product management (doc §1.14.2). All mutations hit the real API. */
export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AdminProduct | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const { toast } = useToast()

  const reload = useCallback(async () => {
    try {
      setFetchError(null)
      const data = await listAdminProducts()
      setProducts(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load products.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listAdminProducts()
      .then((data) => {
        if (!cancelled) setProducts(data)
      })
      .catch((err) => {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : 'Failed to load products.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const closeForm = () => {
    setEditing(null)
    setCreating(false)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await deleteAdminProduct(deleting.id)
      toast(`${deleting.name} deleted`, 'info')
      setDeleting(null)
      await reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-full bg-surface-container-high" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-container-high" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage the catalogue, its variants and images."
        action={
          <AdminButton onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Product
          </AdminButton>
        }
      />

      {fetchError && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {fetchError}
        </p>
      )}

      {products.length === 0 && !fetchError ? (
        <EmptyState
          icon={Package}
          title="No products"
          message="Add your first product to get started."
        />
      ) : (
        <TableWrap caption="All products, including inactive ones">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Variants</Th>
              <Th>Total stock</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                      {p.images[0] && (
                        <Image
                          src={p.images[0].url}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <span className="block font-semibold text-on-surface">{p.name}</span>
                      <span className="block text-[12px] text-on-surface-variant">{p.tagline}</span>
                    </div>
                  </div>
                </Td>
                <Td>{p.category ?? '—'}</Td>
                <Td>{p.variants.length}</Td>
                <Td>
                  <span className={totalStock(p) === 0 ? 'font-semibold text-error' : ''}>
                    {totalStock(p)}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={p.is_active ? 'active' : 'draft'} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      aria-label={`Edit ${p.name}`}
                      className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(p)}
                      aria-label={`Delete ${p.name}`}
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
        <ProductForm
          key={editing?.id ?? 'new'}
          open
          product={editing}
          onClose={closeForm}
          onSaved={() => {
            closeForm()
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name}?`}
        message="This removes the product from the storefront and active catalogue. Historical order records are retained."
        confirmLabel={deleteLoading ? 'Deleting…' : 'Delete'}
        onCancel={() => !deleteLoading && setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}

// ─── Variant local type (adds temp-ID tracking) ───────────────────────────────

interface FormVariant {
  id: string // real UUID or `new_<timestamp>`
  weight_grams: number | null
  weight_label: string
  price_cents: number
  stock_count: number
  sku: string
  is_active: boolean
}

function variantToForm(v: AdminProductVariant): FormVariant {
  return {
    id: v.id,
    weight_grams: v.weight_grams,
    weight_label: v.weight_label ?? '',
    price_cents: v.price_cents,
    stock_count: v.stock_count,
    sku: v.sku ?? '',
    is_active: v.is_active,
  }
}

// ─── Product form (add / edit) ────────────────────────────────────────────────

function ProductForm({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean
  product: AdminProduct | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()

  const [name, setName] = useState(product?.name ?? '')
  const [seoTitle, setSeoTitle] = useState(product?.seo_title ?? '')
  const [seoDescription, setSeoDescription] = useState(product?.seo_description ?? '')
  const [bestseller, setBestseller] = useState(product?.is_bestseller ?? false)
  const [slug, setSlug] = useState(product?.slug ?? '')
  const [tagline, setTagline] = useState(product?.tagline ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [category, setCategory] = useState(product?.category ?? 'Hair Oil')
  const [isActive, setIsActive] = useState(product?.is_active ?? true)

  const [variants, setVariants] = useState<FormVariant[]>(() =>
    (product?.variants ?? []).map(variantToForm),
  )
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Save ──────────────────────────────────────────────────────────────────

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaving(true)

    try {
      if (product) {
        // 1. Update product details
        await updateAdminProduct(product.id, {
          name,
          slug,
          tagline,
          description,
          category,
          is_active: isActive,
          seo_title: seoTitle,
          seo_description: seoDescription,
          is_bestseller: bestseller,
        })

        // 2. Delete removed variants
        for (const id of removedVariantIds) {
          await deleteVariant(id)
        }

        // 3. Add new variants (temp IDs)
        for (const v of variants.filter((v) => v.id.startsWith('new_'))) {
          await addVariant(product.id, {
            weight_grams: v.weight_grams,
            weight_label: v.weight_label || null,
            price_cents: v.price_cents,
            stock_count: v.stock_count,
            sku: v.sku || null,
            is_active: v.is_active,
          })
        }

        // 4. Update changed existing variants
        for (const v of variants.filter((v) => !v.id.startsWith('new_'))) {
          const orig = product.variants.find((o) => o.id === v.id)
          if (!orig) continue
          if (
            orig.weight_grams !== v.weight_grams ||
            (orig.weight_label ?? '') !== v.weight_label ||
            orig.price_cents !== v.price_cents ||
            orig.stock_count !== v.stock_count ||
            (orig.sku ?? '') !== v.sku ||
            orig.is_active !== v.is_active
          ) {
            await updateVariant(v.id, {
              weight_grams: v.weight_grams,
              weight_label: v.weight_label || null,
              price_cents: v.price_cents,
              stock_count: v.stock_count,
              sku: v.sku || null,
              is_active: v.is_active,
            })
          }
        }

        toast(`${name} updated`)
      } else {
        // Create product with all variants inline
        await createAdminProduct({
          name,
          seo_title: seoTitle,
          seo_description: seoDescription,
          is_bestseller: bestseller,
          tagline,
          description,
          category,
          is_active: isActive,
          variants: variants.map((v) => ({
            weight_grams: v.weight_grams,
            weight_label: v.weight_label || null,
            price_cents: v.price_cents,
            stock_count: v.stock_count,
            sku: v.sku || null,
            is_active: v.is_active,
          })),
        })
        toast(`${name} created`)
      }

      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  // ── Variant helpers ───────────────────────────────────────────────────────

  const addNewVariant = () =>
    setVariants((vs) => [
      ...vs,
      {
        id: `new_${Date.now()}`,
        weight_grams: null,
        weight_label: '',
        price_cents: 0,
        stock_count: 0,
        sku: '',
        is_active: true,
      },
    ])

  const patchVariant = (id: string, patch: Partial<FormVariant>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const removeVariant = (id: string) => {
    setVariants((vs) => vs.filter((v) => v.id !== id))
    if (!id.startsWith('new_')) setRemovedVariantIds((ids) => [...ids, id])
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Edit ${product.name}` : 'Add product'}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        {saveError && (
          <p className="flex items-center gap-2 rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {saveError}
          </p>
        )}

        <Field
          label="SEO title"
          value={seoTitle}
          maxLength={255}
          onChange={(e) => setSeoTitle(e.target.value)}
        />
        <TextareaField
          label="SEO description"
          value={seoDescription}
          maxLength={500}
          onChange={(e) => setSeoDescription(e.target.value)}
        />
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={bestseller}
            onChange={(e) => setBestseller(e.target.checked)}
          />
          Bestseller badge
        </label>
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />

        {product && (
          <Field
            label="URL slug"
            hint="Appears in the address bar, e.g. /shop/restorative-hair-oil"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}

        <Field label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />

        <Field
          label="Category"
          value={category}
          maxLength={100}
          onChange={(e) => setCategory(e.target.value)}
        />

        <TextareaField
          label="Description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="flex cursor-pointer items-center gap-3 font-body-md text-body-md text-on-surface">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded accent-primary"
          />
          Active (visible in the store)
        </label>

        {/* Variants */}
        <fieldset className="rounded-xl border border-outline-variant p-4">
          <legend className="px-2 font-label-sm text-label-sm font-bold uppercase text-primary">
            Variants
          </legend>
          {variants.length === 0 && (
            <p className="mb-3 font-body-md text-[13px] text-on-surface-variant">
              No variants yet. A product needs at least one before it can be sold.
            </p>
          )}
          <ul className="space-y-3">
            {variants.map((v) => (
              <li
                key={v.id}
                className="grid grid-cols-2 gap-2 rounded-lg bg-surface-container-low p-3 sm:grid-cols-5"
              >
                <Field
                  label="Label"
                  value={v.weight_label}
                  onChange={(e) => patchVariant(v.id, { weight_label: e.target.value })}
                />
                <Field
                  label="Size (g/ml)"
                  type="number"
                  value={v.weight_grams ?? ''}
                  onChange={(e) =>
                    patchVariant(v.id, {
                      weight_grams: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
                <Field
                  label="Price (cents)"
                  type="number"
                  value={v.price_cents}
                  hint={formatPrice(v.price_cents)}
                  onChange={(e) => patchVariant(v.id, { price_cents: Number(e.target.value) })}
                />
                <Field
                  label="Stock"
                  type="number"
                  value={v.stock_count}
                  onChange={(e) => patchVariant(v.id, { stock_count: Number(e.target.value) })}
                />
                <div className="flex items-end justify-between gap-2">
                  <Field
                    label="SKU"
                    className="flex-1"
                    value={v.sku}
                    onChange={(e) => patchVariant(v.id, { sku: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(v.id)}
                    aria-label={`Remove variant ${v.weight_label || 'untitled'}`}
                    className="mb-1 rounded-full p-2 text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <AdminButton variant="secondary" className="mt-3" onClick={addNewVariant}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add variant
          </AdminButton>
        </fieldset>

        {/* Images — only available when editing an existing product */}
        {product ? (
          <ImageManager product={product} />
        ) : (
          <div className="rounded-xl border border-dashed border-outline p-5 text-center">
            <ImageUp className="mx-auto mb-2 h-8 w-8 text-outline" aria-hidden="true" />
            <p className="font-body-md text-[13px] text-on-surface-variant">
              Images can be added once the product is created.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
          <AdminButton type="submit" className="flex-1" onClick={undefined}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </AdminButton>
          <AdminButton variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </AdminButton>
        </div>
      </form>
    </Modal>
  )
}

// ─── Image manager (edit mode only) ──────────────────────────────────────────

function ImageManager({ product: initialProduct }: { product: AdminProduct }) {
  const { toast } = useToast()
  const [images, setImages] = useState<AdminProductImage[]>(initialProduct.images)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const img = await uploadProductImage(initialProduct.id, file)
      setImages((imgs) => [...imgs, img])
      toast('Image uploaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(imageId: string) {
    setDeletingId(imageId)
    try {
      await deleteProductImage(initialProduct.id, imageId)
      setImages((imgs) => imgs.filter((i) => i.id !== imageId))
      toast('Image removed', 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  async function move(index: number, direction: number) {
    const next = [...images],
      target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    try {
      await reorderProductImages(
        initialProduct.id,
        next.map((image) => image.id),
      )
      setImages(next)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reorder images', 'error')
    }
  }

  return (
    <fieldset className="rounded-xl border border-outline-variant p-4">
      <legend className="px-2 font-label-sm text-label-sm font-bold uppercase text-primary">
        Images
      </legend>

      <ul className="mb-3 flex flex-wrap gap-3">
        {images.map((img, index) => (
          <li
            key={img.id}
            className="relative h-20 w-20 overflow-hidden rounded-lg bg-surface-container"
          >
            <Image src={img.url} alt={img.alt ?? ''} fill sizes="80px" className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-white/90">
              <button
                type="button"
                aria-label={`Move image ${index + 1} earlier`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="px-2"
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Move image ${index + 1} later`}
                disabled={index === images.length - 1}
                onClick={() => move(index, 1)}
                className="px-2"
              >
                →
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(img.id)}
              disabled={deletingId === img.id}
              aria-label="Remove image"
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error text-on-error shadow transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {deletingId === img.id ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <X className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-outline px-4 py-2 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high">
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ImageUp className="h-4 w-4" aria-hidden="true" />
        )}
        {uploading ? 'Uploading…' : 'Upload image'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
    </fieldset>
  )
}
