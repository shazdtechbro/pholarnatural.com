'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EmailStatus from '@/components/admin/EmailStatus'
import PasswordChange from '@/components/admin/PasswordChange'
import {
  Save,
  Send,
  MessageCircle,
  Mail,
  Clock,
  Loader2,
  Smartphone,
  RefreshCw,
  LogOut,
  ShoppingBag,
  CalendarDays,
  CalendarX,
  MessageSquare,
  PackageOpen,
  TicketPercent,
  CreditCard,
  Truck,
  Share2,
  ImagePlus,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import { PageHeader, AdminButton } from '@/components/admin/ui'
import { Field } from '@/components/FormField'
import { useToast } from '@/context/ToastContext'
import {
  loadAdminSettings,
  saveAdminSettings,
  uploadSettingsImage,
  getWhatsAppStatus,
  getWhatsAppQR,
  logoutWhatsApp,
  sendTestWhatsApp,
  type AdminSettingsData,
  type WhatsAppStatus,
} from '@/lib/api/admin-settings'

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
  disabled = false,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-primary' : 'bg-surface-container-highest'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
        aria-hidden="true"
      />
    </button>
  )
}

// ─── WhatsApp connection panel (self-contained with its own polling) ───────────

function WhatsAppConnectionPanel() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  /** Tracks whether we've already dispatched a QR fetch for the current disconnected state. */
  const qrFetchedRef = useRef(false)
  const { toast } = useToast()

  async function fetchQR() {
    setQrLoading(true)
    try {
      const data = await getWhatsAppQR()
      setQrData(data.base64 ?? null)
    } catch {
      // silently ignored — user can hit Refresh QR manually
    } finally {
      setQrLoading(false)
    }
  }

  // Status polling — 10-second cadence.
  // When not connected: fetches QR once per "disconnected session" (qrFetchedRef guard).
  // When newly connected: clears QR so the panel flips to the badge view.
  useEffect(() => {
    let mounted = true

    async function poll() {
      try {
        const s = await getWhatsAppStatus()
        if (!mounted) return
        setStatus(s)
        if (s.connected) {
          qrFetchedRef.current = false
          setQrData(null)
        } else if (!qrFetchedRef.current) {
          qrFetchedRef.current = true
          fetchQR()
        }
      } catch {
        // network error during poll — ignore, try again next tick
      }
    }

    poll()
    const id = setInterval(poll, 10_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  async function disconnect() {
    setDisconnecting(true)
    try {
      await logoutWhatsApp()
      setStatus({ connected: false, state: 'disconnected', phone: null })
      setQrData(null)
      qrFetchedRef.current = false
      await fetchQR()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Disconnect failed', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  async function refreshQR() {
    setQrData(null)
    qrFetchedRef.current = true // already fetching — don't double-fire from next poll
    await fetchQR()
  }

  const isConnected = status?.connected ?? false

  return (
    <section
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6"
      aria-label="WhatsApp connection"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-primary">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
          WhatsApp connection
        </h2>

        {status === null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 font-label-sm text-label-sm text-on-surface-variant">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Checking…
          </span>
        ) : isConnected ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-label-sm text-label-sm text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-error-container px-3 py-1 font-label-sm text-label-sm text-on-error-container">
            <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            Not connected
          </span>
        )}
      </div>

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-4">
          {status?.phone && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              Linked number: <span className="font-semibold text-on-surface">+{status.phone}</span>
            </p>
          )}
          <p className="font-body-md text-body-md text-on-surface-variant">
            The instance is live and ready to deliver notifications.
          </p>
          <AdminButton
            variant="secondary"
            onClick={disconnect}
            disabled={disconnecting}
            type="button"
          >
            {disconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            Disconnect
          </AdminButton>
        </div>
      )}

      {/* Not connected — show QR */}
      {!isConnected && (
        <div className="space-y-4">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Open WhatsApp on your phone → Linked devices → Link a device, then scan:
          </p>

          <div
            className="flex min-h-[220px] items-center justify-center rounded-xl border border-outline-variant bg-white p-4"
            aria-label="QR code"
          >
            {qrLoading && (
              <Loader2
                className="h-10 w-10 animate-spin text-primary"
                aria-label="Loading QR code"
              />
            )}
            {!qrLoading && qrData && (
              /* base64 comes from backend as a full data URI */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrData}
                alt="WhatsApp QR code — scan with your phone to connect"
                className="h-48 w-48 object-contain"
              />
            )}
            {!qrLoading && !qrData && (
              <p className="text-center font-body-md text-[13px] text-on-surface-variant">
                Could not load QR code.
                <br />
                Tap Refresh QR to try again.
              </p>
            )}
          </div>

          <p className="font-body-md text-[12px] text-on-surface-variant">
            QR codes expire after ~30 seconds. The panel will update automatically once your phone
            confirms the link.
          </p>

          <AdminButton variant="secondary" onClick={refreshQR} disabled={qrLoading} type="button">
            {qrLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Refresh QR
          </AdminButton>
        </div>
      )}
    </section>
  )
}

// ─── Notification event definitions ──────────────────────────────────────────

const NOTIFICATION_EVENTS: {
  key: keyof AdminSettingsData
  label: string
  description: string
  Icon: LucideIcon
  note?: string
}[] = [
  {
    key: 'notify_new_order',
    label: 'New order',
    description: 'Customer places a shop order',
    Icon: ShoppingBag,
  },
  {
    key: 'notify_new_booking',
    label: 'New booking',
    description: 'Customer books a service appointment',
    Icon: CalendarDays,
  },
  {
    key: 'notify_booking_cancelled',
    label: 'Booking cancelled',
    description: 'Customer or admin cancels an appointment',
    Icon: CalendarX,
  },
  {
    key: 'notify_new_contact_message',
    label: 'New contact message',
    description: 'Customer submits the contact form',
    Icon: MessageSquare,
  },
  {
    key: 'notify_low_stock',
    label: 'Low stock',
    description: 'A product variant drops below the threshold',
    Icon: PackageOpen,
  },
  {
    key: 'notify_discount_maxed_out',
    label: 'Discount maxed out',
    description: 'A promo code reaches its usage limit',
    Icon: TicketPercent,
  },
  {
    key: 'notify_payment_failed',
    label: 'Payment failed',
    description: "A customer's payment could not be completed",
    Icon: CreditCard,
    note: 'Alerts are enabled by default and can be turned off here.',
  },
]

// ─── Main settings page ───────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const { toast } = useToast()

  async function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'hero_image_url' | 'featured_image_url',
  ) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingKey(field)
    try {
      const url = await uploadSettingsImage(file)
      set(field, url)
      toast('Image uploaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploadingKey(null)
      e.target.value = ''
    }
  }

  useEffect(() => {
    loadAdminSettings()
      .then(setSettings)
      .catch(() => toast('Failed to load settings', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  const set = useCallback(
    <K extends keyof AdminSettingsData>(key: K, value: AdminSettingsData[K]) => {
      setSettings((s) => (s ? { ...s, [key]: value } : s))
    },
    [],
  )

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    try {
      await saveAdminSettings(settings)
      toast('Settings saved')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      await sendTestWhatsApp()
      toast('Test message sent — check your WhatsApp')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Test send failed', 'error')
    } finally {
      setTesting(false)
    }
  }

  if (loading || !settings) {
    return (
      <>
        <PageHeader
          title="Settings"
          description="Notifications, WhatsApp connection, and business config."
        />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading settings" />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Notifications, WhatsApp connection, and business config."
      />

      <div className="max-w-2xl space-y-6">
        {/* WhatsApp connection — link/unlink, QR code, status */}
        <WhatsAppConnectionPanel />

        <form onSubmit={save} className="space-y-6">
          {/* WhatsApp notification toggles */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="mb-1 flex items-center gap-2 font-headline-md text-headline-md text-primary">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp notifications
            </h2>
            <p className="mb-5 font-body-md text-body-md text-on-surface-variant">
              Choose which events send a message to the number below. The instance above must be
              connected for any alert to deliver.
            </p>

            <Field
              label="Notifier WhatsApp number"
              type="tel"
              value={settings.notifier_whatsapp_number}
              hint="Include country code, e.g. +1 416 555 0142. Alerts go here."
              placeholder="+1 416 555 0142"
              onChange={(e) => set('notifier_whatsapp_number', e.target.value)}
            />

            <fieldset className="mt-5 space-y-1" aria-label="Notification events">
              <legend className="mb-3 font-label-sm text-label-sm font-bold uppercase text-on-surface-variant">
                Events
              </legend>
              {NOTIFICATION_EVENTS.map((ev) => (
                <div
                  key={ev.key}
                  className="flex items-start gap-4 rounded-xl p-3 transition-colors hover:bg-surface-container-low"
                >
                  <Toggle
                    id={`toggle-${ev.key}`}
                    checked={settings[ev.key] as boolean}
                    onChange={(v) => set(ev.key, v as AdminSettingsData[typeof ev.key])}
                  />
                  <label htmlFor={`toggle-${ev.key}`} className="flex-1 cursor-pointer">
                    <span className="flex items-center gap-2 font-body-md text-body-md font-semibold text-on-surface">
                      <ev.Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {ev.label}
                    </span>
                    <span className="block font-body-md text-[12px] text-on-surface-variant">
                      {ev.description}
                    </span>
                    {ev.note && (
                      <span className="mt-1 block font-body-md text-[11px] italic text-on-surface-variant">
                        {ev.note}
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </fieldset>

            <div className="mt-5 max-w-xs">
              <Field
                label="Low-stock threshold"
                type="number"
                min={1}
                max={999}
                value={settings.low_stock_threshold}
                hint="Alert fires when variant stock_count ≤ this."
                onChange={(e) => set('low_stock_threshold', Number(e.target.value))}
              />
            </div>

            <AdminButton
              variant="secondary"
              className="mt-5"
              onClick={sendTest}
              disabled={testing}
              type="button"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Send test message
            </AdminButton>
          </section>

          <PasswordChange />

          {/* Email notifications */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="mb-1 flex items-center gap-2 font-headline-md text-headline-md text-primary">
              <Mail className="h-5 w-5" aria-hidden="true" />
              Email notifications
            </h2>
            <label className="my-4 flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.email_notifications_enabled}
                onChange={(e) => set('email_notifications_enabled', e.target.checked)}
              />
              Send order and appointment alerts to admin email recipients
            </label>
            <p>
              Customers always receive transactional payment, order and appointment emails. Turning
              off admin alerts does not turn off customer receipts.
            </p>
            <EmailStatus />
          </section>

          {/* Shipping & tax */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="mb-1 flex items-center gap-2 font-headline-md text-headline-md text-primary">
              <Truck className="h-5 w-5" aria-hidden="true" />
              Shipping & tax
            </h2>
            <p className="mb-5 font-body-md text-body-md text-on-surface-variant">
              Rates are applied at checkout based on destination country. All amounts in CAD cents
              (e.g. 995 = CAD $9.95).
            </p>
            <Field
              label="Free shipping above (CAD cents)"
              type="number"
              min={0}
              value={settings.free_shipping_threshold_cents}
              onChange={(e) => set('free_shipping_threshold_cents', Number(e.target.value))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Canada rate (cents)"
                type="number"
                min={0}
                value={settings.shipping_rate_domestic_cents}
                hint="e.g. 995 = CAD $9.95"
                onChange={(e) => set('shipping_rate_domestic_cents', Number(e.target.value))}
              />
              <Field
                label="United States rate (cents)"
                type="number"
                min={0}
                value={settings.shipping_rate_us_cents}
                onChange={(e) => set('shipping_rate_us_cents', Number(e.target.value))}
              />
              <Field
                label="United Kingdom rate (cents)"
                type="number"
                min={0}
                value={settings.shipping_rate_uk_cents}
                onChange={(e) => set('shipping_rate_uk_cents', Number(e.target.value))}
              />
              <Field
                label="International rate (cents)"
                type="number"
                min={0}
                value={settings.shipping_rate_international_cents}
                onChange={(e) => set('shipping_rate_international_cents', Number(e.target.value))}
              />
            </div>
            <div className="mt-4 max-w-xs">
              <Field
                label="Tax rate (%)"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={settings.tax_rate_percent}
                hint="Ontario HST default is 13"
                onChange={(e) => set('tax_rate_percent', Number(e.target.value))}
              />
            </div>
          </section>

          {/* Social media */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="mb-1 flex items-center gap-2 font-headline-md text-headline-md text-primary">
              <Share2 className="h-5 w-5" aria-hidden="true" />
              Social media
            </h2>
            <p className="mb-5 font-body-md text-body-md text-on-surface-variant">
              Links appear in the footer. Leave blank to hide the icon.
            </p>
            <div className="space-y-4">
              <Field
                label="Instagram URL"
                type="url"
                value={settings.instagram_url}
                placeholder="https://instagram.com/pholarnatural"
                onChange={(e) => set('instagram_url', e.target.value)}
              />
              <Field
                label="Facebook URL"
                type="url"
                value={settings.facebook_url}
                placeholder="https://facebook.com/pholarnatural"
                onChange={(e) => set('facebook_url', e.target.value)}
              />
              <Field
                label="TikTok URL"
                type="url"
                value={settings.tiktok_url}
                placeholder="https://tiktok.com/@pholarnatural"
                onChange={(e) => set('tiktok_url', e.target.value)}
              />
            </div>
          </section>

          {/* Homepage content */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="mb-1 flex items-center gap-2 font-headline-md text-headline-md text-primary">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              Homepage content
            </h2>
            <p className="mb-5 font-body-md text-body-md text-on-surface-variant">
              Control which products and services are featured, and upload hero images. Featured IDs
              are comma-separated slugs or UUIDs.
            </p>

            <div className="space-y-4">
              <Field
                label="Featured product IDs"
                type="text"
                value={settings.featured_product_ids}
                placeholder="uuid1,uuid2"
                hint="Comma-separated product UUIDs. Leave blank to use defaults."
                onChange={(e) => set('featured_product_ids', e.target.value)}
              />
              <Field
                label="Featured service IDs"
                type="text"
                value={settings.featured_service_ids}
                placeholder="uuid1,uuid2"
                hint="Comma-separated service UUIDs. Leave blank to use defaults."
                onChange={(e) => set('featured_service_ids', e.target.value)}
              />
            </div>

            {/* Hero image */}
            <div className="mt-6">
              <p className="mb-2 font-label-sm text-label-sm font-semibold text-on-surface">
                Hero image
              </p>
              {settings.hero_image_url && (
                <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl border border-outline-variant">
                  <Image
                    src={settings.hero_image_url}
                    alt="Hero"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 600px"
                  />
                </div>
              )}
              <Field
                label="Hero image URL"
                type="url"
                value={settings.hero_image_url}
                placeholder="https://res.cloudinary.com/…"
                onChange={(e) => set('hero_image_url', e.target.value)}
              />
              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-3 font-label-sm text-label-sm text-on-surface-variant hover:border-primary hover:text-primary">
                {uploadingKey === 'hero_image_url' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                )}
                Upload new hero image
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadingKey !== null}
                  onChange={(e) => handleImageUpload(e, 'hero_image_url')}
                />
              </label>
            </div>

            {/* Featured image */}
            <div className="mt-6">
              <p className="mb-2 font-label-sm text-label-sm font-semibold text-on-surface">
                Featured section image
              </p>
              {settings.featured_image_url && (
                <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl border border-outline-variant">
                  <Image
                    src={settings.featured_image_url}
                    alt="Featured"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 600px"
                  />
                </div>
              )}
              <Field
                label="Featured image URL"
                type="url"
                value={settings.featured_image_url}
                placeholder="https://res.cloudinary.com/…"
                onChange={(e) => set('featured_image_url', e.target.value)}
              />
              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-3 font-label-sm text-label-sm text-on-surface-variant hover:border-primary hover:text-primary">
                {uploadingKey === 'featured_image_url' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                )}
                Upload new featured image
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadingKey !== null}
                  onChange={(e) => handleImageUpload(e, 'featured_image_url')}
                />
              </label>
            </div>
          </section>

          {/* Business hours — informational */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <h2 className="mb-1 flex items-center gap-2 font-headline-md text-headline-md text-primary">
              <Clock className="h-5 w-5" aria-hidden="true" />
              Business hours
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Mon–Sat, 10:00–17:00. Sundays closed. Slot times are fixed in{' '}
              <code className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[12px]">
                lib/config.ts
              </code>
              .
            </p>
          </section>

          <AdminButton type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Save settings
          </AdminButton>
        </form>
      </div>
    </>
  )
}
