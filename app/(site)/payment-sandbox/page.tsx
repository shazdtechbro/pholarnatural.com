'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Field } from '@/components/FormField'
import { ShieldCheck, ShoppingBag, CalendarDays, ArrowRight } from 'lucide-react'

const base = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').replace(/\/$/, '') + '/sandbox'
const button = 'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 font-semibold text-white disabled:opacity-50'
type Product = { id: string; name: string; variants: { id: string; weight_label: string; price_cents: number; stock_count: number }[] }
type Service = { id: string; name: string; price_cents: number }
type Receipt = { id: string; status: string; currency: string; total_cents?: number; deposit_cents?: number; service_name?: string; items?: { product_name: string; quantity: number }[] }
type Config = { sandbox: boolean; configured: boolean; provider: string; currency: string }
type Return = { kind: 'order' | 'booking'; id: string; token: string }
type Email = { subject: string; status: string }
const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value/100) + ' USD'

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(base+'/api/v1'+path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(20000) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Sandbox request failed. Please retry.')
  return data as T
}

export default function SandboxPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [kind, setKind] = useState<'order' | 'booking'>('order')
  const [productId, setProductId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [returned, setReturned] = useState<Return | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [notice, setNotice] = useState('')
  const [poll, setPoll] = useState(0)
  const request = useRef<{ body: string; id: string } | null>(null)
  const variant = products.flatMap((p) => p.variants).find((v) => v.id === productId)
  const service = services.find((s) => s.id === serviceId)

  useEffect(() => {
    let stopped = false
    Promise.all([call<Config>('/payments/info'), call<Product[]>('/products/'), call<Service[]>('/services/')]).then(([info, catalogue, treatments]) => {
      if (stopped) return
      if (!info.sandbox || info.provider !== 'bachs' || info.currency !== 'USD') throw new Error('This is not an isolated Bachs sandbox. Checkout is disabled.')
      setConfig(info); setProducts(catalogue); setServices(treatments)
      setProductId(catalogue[0]?.variants[0]?.id ?? ''); setServiceId(treatments[0]?.id ?? '')
      const params = new URLSearchParams(window.location.search)
      const type = params.get('kind'), id = params.get('id'), token = params.get('token')
      if ((type === 'order' || type === 'booking') && id && token) {
        setReturned({ kind: type, id, token })
        // Keep the receipt recoverable on refresh, then remove the secret URL from history.
        try { sessionStorage.setItem('pholar-bachs-return', JSON.stringify({ kind: type, id, token })) } catch {}
        window.history.replaceState(null, '', window.location.pathname)
      } else if (!params.has('cancelled')) {
        try { const stored = sessionStorage.getItem('pholar-bachs-return'); if (stored) setReturned(JSON.parse(stored) as Return) } catch {}
      } else setNotice('Payment was cancelled. Nothing was fulfilled. You can start another sandbox checkout.')
    }).catch((err) => { if (!stopped) setError(err instanceof Error ? err.message : 'Sandbox is not available yet.') })
    return () => { stopped = true }
  }, [])

  useEffect(() => {
    if (!date || !serviceId) return
    let stopped = false
    call<{ slots: { time: string; available: boolean }[] }>(`/bookings/slots?date=${date}&service_id=${serviceId}`).then((result) => {
      if (!stopped) { setSlots(result.slots); setTime(result.slots.find((slot) => slot.available)?.time ?? '') }
    }).catch((err) => { if (!stopped) setError(err.message) })
    return () => { stopped = true }
  }, [date, serviceId])

  useEffect(() => {
    if (!returned || !config) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const path = returned.kind === 'order' ? 'orders' : 'bookings'
    async function check() {
      try {
        const headers = { 'X-Confirmation-Token': returned!.token }
        const record = await call<Receipt>(`/${path}/${returned!.id}`, { headers })
        const composed = await call<Email[]>(`/payments/sandbox/${returned!.kind}/${returned!.id}/emails`, { headers })
        if (stopped) return
        setReceipt(record); setEmails(composed)
        if (++attempts < 60 && ['pending', 'refund_pending'].includes(record.status)) timer = setTimeout(check, 2000)
      } catch (err) { if (!stopped) setError(err instanceof Error ? err.message : 'Could not check payment.') }
    }
    void check()
    return () => { stopped = true; clearTimeout(timer) }
  }, [returned, config, poll])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name')), email = String(form.get('email'))
    const quantity = Number(form.get('quantity') ?? 1)
    const body = kind === 'order' ? {
      customer_name: name, customer_email: email,
      shipping_address: { full_name: name, address_line1: '1 Sandbox Street', city: 'Toronto', province: 'Ontario', postal_code: 'M5V 1A1', country: 'Canada' },
      items: [{ variant_id: productId, quantity }], discount_code: String(form.get('discount') ?? '').trim() || undefined,
    } : { service_id: serviceId, customer_name: name, customer_email: email, booking_date: date, start_time: time+':00' }
    const serialized = JSON.stringify({ kind, body })
    if (request.current?.body !== serialized) request.current = { body: serialized, id: crypto.randomUUID() }
    try {
      const result = await call<{ checkout_url: string }>(kind === 'order' ? '/orders/' : '/bookings/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.current.id }, body: JSON.stringify(body) })
      const url = new URL(result.checkout_url)
      if (url.protocol !== 'https:' || url.hostname !== 'sandbox-checkout.bachs.io') throw new Error('A non-sandbox checkout was refused.')
      try { sessionStorage.removeItem('pholar-bachs-return') } catch {}
      window.location.assign(result.checkout_url)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start sandbox checkout.'); setBusy(false) }
  }

  async function refund() {
    if (!returned) return
    setBusy(true); setError('')
    try {
      const result = await call<{ status: string }>(`/payments/sandbox/${returned.kind}/${returned.id}/refund`, { method: 'POST', headers: { 'X-Confirmation-Token': returned.token } })
      setReceipt((old) => old ? { ...old, status: result.status } : old); setPoll((old) => old+1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Refund could not be requested.') }
    finally { setBusy(false) }
  }

  return <section className="mx-auto max-w-5xl px-5 py-12 md:px-12">
    <div className="mb-8 rounded-2xl border border-secondary/40 bg-secondary/10 p-5"><p className="flex items-center gap-3 font-semibold text-primary"><ShieldCheck className="h-5 w-5" /> Sandbox · No real money</p><p className="mt-2 text-sm leading-7">Sample USD prices, test stock and test appointments. Nothing here creates a real shipment or reserves a real studio appointment. Emails are composed for inspection and are not sent.</p></div>
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Pholar Natural × Bachs</p><h1 className="font-headline-display text-4xl text-primary">Try the complete payment journey.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-on-surface-variant">Choose a test order or booking deposit, pay on Bachs’ sandbox checkout, then return here to see the verified result. Choose USD for international cards, or a supported local currency for its payment methods.</p>
    {error && <p role="alert" className="my-5 rounded-xl bg-error/5 p-4 text-sm text-error">{error}</p>}
    {notice && <p role="status" className="my-5 rounded-xl bg-primary/5 p-4 text-sm">{notice}</p>}
    {!config && !error && <p role="status" className="py-12">Connecting to the sandbox…</p>}
    {config && !config.configured && <p role="status" className="my-6 rounded-xl border border-secondary/40 p-5 text-sm">The sandbox is deployed. Its API key and webhook signing secret must both be configured before payments can be tested.</p>}
    {returned && <div className="my-8 rounded-2xl border border-outline-variant p-6"><h2 className="font-headline-display text-2xl text-primary">{returned.kind === 'order' ? 'Test order' : 'Test appointment'} result</h2><p className="mt-4 text-sm" role="status">{receipt ? `Verified application status: ${receipt.status.replaceAll('_', ' ')}` : 'Waiting for the verified server result…'}</p><p className="mt-2 text-xs text-on-surface-variant">A return from checkout does not confirm payment. This page reads the server’s reconciled result.</p>{receipt && <><p className="mt-4 font-semibold">{usd(receipt.total_cents ?? receipt.deposit_cents ?? 0)}</p><p className="mt-2 text-xs">Reference {receipt.id.slice(0, 8).toUpperCase()}</p>{['paid', 'confirmed'].includes(receipt.status) && <button disabled={busy} onClick={refund} className={`${button} mt-5`}>Test a full refund</button>}<button className="ml-4 mt-5 text-sm font-semibold text-primary underline" onClick={() => { setPoll((old) => old+1); setError('') }}>Refresh result</button></>}<h3 className="mt-6 font-semibold">Composed test emails</h3><ul className="mt-3 space-y-2 text-sm">{emails.length ? emails.map((email, index) => <li key={index}>{email.subject} · {email.status === 'sandbox' ? 'Saved in sandbox; not sent' : email.status}</li>) : <li>No confirmation email until a payment is verified.</li>}</ul><button onClick={() => { setReturned(null); setReceipt(null); setEmails([]); setError(''); request.current = null; try { sessionStorage.removeItem('pholar-bachs-return') } catch {} }} className="mt-6 text-sm font-semibold text-primary underline">Start another test</button></div>}
    {!returned && config && <div className="my-8 grid gap-8 md:grid-cols-[1fr_300px]">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-outline-variant p-6"><div className="flex gap-3"><button type="button" aria-pressed={kind === 'order'} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${kind === 'order' ? 'border-primary bg-primary/5' : 'border-outline-variant'}`} onClick={() => setKind('order')}><ShoppingBag className="h-4 w-4" /> Product order</button><button type="button" aria-pressed={kind === 'booking'} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${kind === 'booking' ? 'border-primary bg-primary/5' : 'border-outline-variant'}`} onClick={() => setKind('booking')}><CalendarDays className="h-4 w-4" /> Booking deposit</button></div>
        <Field name="name" label="Test customer name" required defaultValue="Sandbox Customer" maxLength={255} /><Field name="email" label="Test customer email" type="email" required defaultValue="tester@example.com" />
        {kind === 'order' ? <><label className="block text-sm font-semibold">Sample product<select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-2 block w-full rounded-xl border border-outline-variant bg-background p-3">{products.flatMap((product) => product.variants.map((v) => <option key={v.id} value={v.id}>{product.name} · {v.weight_label} · {usd(v.price_cents)}</option>))}</select></label><Field name="quantity" label="Quantity" type="number" min={1} max={Math.min(5, variant?.stock_count ?? 5)} defaultValue={1} required /><Field name="discount" label="Discount code" hint="Use SANDBOX10 to test a 10% discount." /></> : <><label className="block text-sm font-semibold">Sample service<select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setTime('') }} className="mt-2 block w-full rounded-xl border border-outline-variant bg-background p-3">{services.map((s) => <option key={s.id} value={s.id}>{s.name} · {usd(s.price_cents)} total</option>)}</select></label><Field label="Appointment date" type="date" required value={date} onChange={(event) => { setDate(event.target.value); setTime('') }} /><label className="block text-sm font-semibold">Available time (Toronto)<select required value={time} onChange={(event) => setTime(event.target.value)} className="mt-2 block w-full rounded-xl border border-outline-variant bg-background p-3"><option value="">Choose a date first</option>{slots.filter((slot) => slot.available).map((slot) => <option key={slot.time} value={slot.time}>{slot.time}</option>)}</select></label><p className="text-sm text-primary">10% test deposit: {usd(Math.round((service?.price_cents ?? 0)/10))}. Remaining amount is not charged online.</p></>}
        <button disabled={busy || !config.configured || (kind === 'booking' && !time)} className={`${button} w-full`} type="submit">{busy ? 'Opening sandbox checkout…' : 'Continue to Bachs sandbox'}<ArrowRight className="h-4 w-4" /></button>
      </form>
      <aside className="h-fit rounded-2xl bg-primary/5 p-6 text-sm leading-7"><h2 className="font-headline-display text-xl text-primary">What to try</h2><ul className="mt-4 list-disc space-y-3 pl-4"><li>A successful test card payment.</li><li>A declined card, then a successful retry.</li><li>Ghana mobile money or Nigerian bank transfer using Bachs’ simulator.</li><li>Cancel checkout and return without paying.</li><li>A full card or mobile-money refund after success.</li></ul><p className="mt-5">Test shipping and tax are calculated on the server. They are sample settings, not live prices.</p><p className="mt-4">Bank transfers cannot be automatically refunded. Booking checkout offers refundable methods only.</p></aside>
    </div>}
    <p className="mt-8 text-sm text-on-surface-variant">Finished testing? <Link href="/shop" className="font-semibold text-primary underline">Return to the live shop</Link></p>
  </section>
}
