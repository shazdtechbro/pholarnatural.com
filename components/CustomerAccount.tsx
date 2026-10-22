'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Package, ShoppingBag, ShieldCheck } from 'lucide-react'
import { Field } from '@/components/FormField'
import PasswordField from '@/components/PasswordField'
import { useCustomer } from '@/context/CustomerContext'
import { useCart } from '@/context/CartContext'
import { accountApi, type AccountHistory } from '@/lib/api/customer'
import { formatPrice } from '@/lib/format'

const button = 'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const secondary = 'inline-flex items-center justify-center rounded-full border border-primary px-6 py-3 text-sm font-semibold text-primary'
type Mode = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify'

export function AccountForm({ mode = 'login' }: { mode?: Mode }) {
  const { customer, ready, authenticate, refresh } = useCustomer()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [token, setToken] = useState('')
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
    if (fragment) Promise.resolve().then(() => setToken(fragment))
    if (fragment) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const titles: Record<Mode, string> = { login: 'Welcome back.', register: 'Make yourself at home.', 'forgot-password': 'Forgot your password?', 'reset-password': 'A fresh start.', verify: 'One last step.' }
  const descriptions: Record<Mode, string> = {
    login: 'Your saved cart, appointments and orders, all in one place.',
    register: 'Save your favourites in your cart and keep your bookings and orders close. Creating an account is always optional.',
    'forgot-password': 'Enter your email and we’ll send you a link to choose a new password.',
    'reset-password': 'Choose a new password for your Pholar Natural account.',
    verify: 'Confirm your email with the password you chose to securely unlock your bookings and orders.',
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email') ?? '').trim()
    const password = String(values.get('password') ?? '')
    try {
      if (mode === 'register' || mode === 'login') {
        await authenticate(mode, { email, password, ...(mode === 'register' ? { name: String(values.get('name') ?? '').trim() } : {}) })
        const next = new URLSearchParams(window.location.search).get('next')
        router.replace(['/cart', '/checkout', '/book'].includes(next ?? '') ? next! : '/account')
      } else if (mode === 'verify') {
        await accountApi('/verify', { token, password }); await refresh(); setDone(true)
        setMessage('Email verified. Your bookings and orders are ready.')
      } else {
        const result = await accountApi<{ message: string }>(`/${mode}`, mode === 'forgot-password' ? { email } : { token, password })
        setMessage(result.message); setDone(true)
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }
  if (ready && customer && (mode === 'login' || mode === 'register')) return <AccountDashboard />
  const actionMode = mode === 'verify' || mode === 'reset-password'
  return <section className="mx-auto max-w-6xl px-5 py-8 md:px-12 md:py-20">
    <div className="grid overflow-hidden rounded-3xl border border-outline-variant/60 bg-surface-container-low md:grid-cols-2">
      <div className="flex flex-col justify-between bg-primary p-6 text-white md:p-12">
        <div><p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Your natural ritual</p><h1 className="font-headline-display text-3xl leading-tight md:text-5xl">{titles[mode]}</h1><p className="mt-5 max-w-sm text-sm leading-7 text-white/80">{descriptions[mode]}</p></div>
        <div className="mt-12 hidden space-y-5 text-sm md:block"><p className="flex items-center gap-3"><ShoppingBag className="h-5 w-5" /> A cart that comes back with you</p><p className="flex items-center gap-3"><CalendarDays className="h-5 w-5" /> Your appointments, easy to find</p><p className="flex items-center gap-3"><Package className="h-5 w-5" /> Your orders in one place</p></div>
      </div>
      <div className="bg-background p-6 sm:p-8 md:p-12">
        {(mode === 'login' || mode === 'register') && <div className="mb-8 flex gap-6 border-b border-outline-variant pb-4 text-sm font-semibold"><Link href="/account" aria-current={mode === 'login' ? 'page' : undefined} className={mode === 'login' ? 'text-primary underline underline-offset-8' : 'text-on-surface-variant'}>Sign in</Link><Link href="/account/register" aria-current={mode === 'register' ? 'page' : undefined} className={mode === 'register' ? 'text-primary underline underline-offset-8' : 'text-on-surface-variant'}>Create an account</Link></div>}
        <h2 className="mb-6 font-headline-display text-2xl text-primary">{mode === 'register' ? 'A little about you' : mode === 'login' ? 'Sign in to your account' : mode === 'verify' ? 'Verify your email' : mode === 'reset-password' ? 'Choose a new password' : 'Let’s get you back in'}</h2>
        {error && <p role="alert" className="mb-5 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error">{error}</p>}
        {message && <p role="status" className="mb-5 rounded-xl bg-primary/5 p-4 text-sm leading-6 text-primary">{message}</p>}
        {!done && <form onSubmit={submit} className="space-y-5">
          {mode === 'register' && <Field name="name" label="Your name" autoComplete="name" required maxLength={255} />}
          {!actionMode && <Field name="email" label="Email address" type="email" autoComplete="email" required maxLength={255} />}
          {mode !== 'forgot-password' && <PasswordField name="password" label={mode === 'reset-password' ? 'New password' : 'Password'} required autoComplete={mode === 'register' || mode === 'reset-password' ? 'new-password' : 'current-password'} minLength={mode === 'register' || mode === 'reset-password' ? 12 : 1} maxLength={128} hint={mode === 'register' || mode === 'reset-password' ? 'At least 12 characters. A memorable phrase works well.' : undefined} />}
          {actionMode && !token && <p className="text-sm text-error">Open the link in your email to continue, or request a fresh link.</p>}
          {mode === 'login' && <Link href="/account/forgot-password" className="block text-sm text-primary underline underline-offset-4">Forgot password?</Link>}
          {mode === 'register' && <p className="text-xs leading-6 text-on-surface-variant">By creating an account, you agree to our <Link href="/terms-of-service" className="underline">Terms</Link> and <Link href="/privacy-policy" className="underline">Privacy Policy</Link>. This does not subscribe you to marketing emails.</p>}
          <button disabled={busy || (actionMode && !token)} className={`${button} w-full`} type="submit">{busy ? 'Please wait…' : mode === 'register' ? 'Create my account' : mode === 'login' ? 'Sign in' : mode === 'verify' ? 'Verify my email' : mode === 'reset-password' ? 'Save new password' : 'Send reset link'}<ArrowRight className="h-4 w-4" /></button>
        </form>}
        {done && <Link className={button} href="/account">{mode === 'verify' ? 'Go to my account' : 'Back to sign in'}</Link>}
        {actionMode && !token && !done && <Link href={mode === 'verify' ? '/account' : '/account/forgot-password'} className="mt-4 block text-sm text-primary underline">{mode === 'verify' ? 'Sign in to request another verification email' : 'Request another reset link'}</Link>}
        <p className="mt-7 text-center text-sm text-on-surface-variant">Just browsing? <Link href="/shop" className="font-semibold text-primary underline underline-offset-4">Continue shopping</Link></p>
        <p className="mt-3 text-center text-xs leading-6 text-on-surface-variant">You can shop and book without creating an account.</p>
      </div>
    </div>
  </section>
}

export function CartSyncNotice() {
  const { syncStatus, syncMessage, retrySave, reloadSavedCart } = useCart()
  const [busy, setBusy] = useState(false)
  if (!syncMessage) return null
  return <div role="status" className="my-4 rounded-xl border border-secondary/40 bg-secondary/5 p-4 text-sm leading-6"><p>{syncMessage}</p><div className="mt-3 flex flex-wrap gap-4">{syncStatus !== 'conflict' && <button disabled={busy} className="font-semibold text-primary underline" onClick={async () => { setBusy(true); try { await retrySave() } finally { setBusy(false) } }}>Retry saving</button>}<button disabled={busy} className="font-semibold text-primary underline" onClick={async () => { if (!window.confirm('Load your account’s saved cart? This replaces the unsaved cart edits in this browser.')) return; setBusy(true); try { await reloadSavedCart() } finally { setBusy(false) } }}>Load saved cart</button></div></div>
}

export function AccountDashboard() {
  const { customer, ready, unavailable, refresh, signOut } = useCustomer()
  const { items, count, subtotalCents, syncStatus } = useCart()
  const [history, setHistory] = useState<AccountHistory | null>(null)
  const [tab, setTab] = useState<'bookings' | 'orders' | 'cart'>('bookings')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let stopped = false
    if (customer?.verified) accountApi<AccountHistory>('/history').then((result) => { if (!stopped) setHistory(result) }).catch(() => { if (!stopped) setError('Could not load your history. Please refresh to try again.') })
    return () => { stopped = true }
  }, [customer?.id, customer?.verified])
  if (!ready) return <p className="px-5 py-20 text-center" role="status">Loading your account…</p>
  if (!customer) return <><AccountForm />{unavailable && <p role="alert" className="mx-auto max-w-lg px-5 pb-8 text-error">We couldn’t check your session. Please try signing in again.</p>}</>
  async function resend() {
    setBusy(true); setError(''); try { const result = await accountApi<{ message: string }>('/resend-verification', {}); setMessage(result.message) } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') } finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-6xl px-5 py-12 md:px-12 md:py-16">
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">Your personal space</p><h1 className="font-headline-display text-4xl text-primary">Hello, {customer.name.split(' ')[0]}.</h1><p className="mt-3 break-all text-sm text-on-surface-variant">{customer.email}</p></div><button disabled={busy || syncStatus === 'saving'} className={secondary} onClick={async () => { if (syncStatus === 'error' || syncStatus === 'conflict' || syncStatus === 'blocked') { setError('Save your cart or load the saved cart before signing out.'); return } setBusy(true); try { await signOut(); setHistory(null) } catch { setError('Could not sign out. Please try again.') } finally { setBusy(false) } }}>Sign out</button></div>
    {!customer.verified && <div className="my-8 rounded-2xl border border-secondary/40 bg-secondary/5 p-6"><div className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold text-primary">Check your inbox to verify your email</h2><p className="mt-2 text-sm leading-6 text-on-surface-variant">Your cart is ready to save. Verify {customer.email} to see bookings and orders placed with this email, including past guest purchases.</p><div className="mt-4 flex flex-wrap gap-5 text-sm font-semibold text-primary"><button disabled={busy} className="underline underline-offset-4" onClick={resend}>Resend verification email</button><button disabled={busy} className="underline underline-offset-4" onClick={() => void refresh()}>I’ve verified my email</button></div></div></div></div>}
    {error && <p role="alert" className="my-4 rounded-xl bg-error/5 p-4 text-sm text-error">{error}</p>}{message && <p role="status" className="my-4 rounded-xl bg-primary/5 p-4 text-sm text-primary">{message}</p>}
    <CartSyncNotice />
    <div className="my-8 grid gap-4 sm:grid-cols-3">{[{ key: 'bookings' as const, label: 'My bookings', icon: CalendarDays, detail: customer.verified ? `${history?.bookings.length ?? '…'} appointments` : 'Verify email to view' }, { key: 'orders' as const, label: 'My orders', icon: Package, detail: customer.verified ? `${history?.orders.length ?? '…'} orders` : 'Verify email to view' }, { key: 'cart' as const, label: 'My cart', icon: ShoppingBag, detail: `${count} items · ${formatPrice(subtotalCents)}` }].map(({ key, label, icon: Icon, detail }) => <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key} className={`rounded-2xl border p-6 text-left transition-colors ${tab === key ? 'border-primary bg-primary/5' : 'border-outline-variant/60 hover:bg-surface-container-low'}`}><Icon className="mb-4 h-6 w-6 text-primary" /><span className="block font-semibold text-primary">{label}</span><span className="mt-2 block text-xs text-on-surface-variant">{detail}</span></button>)}</div>
    <div className="rounded-2xl border border-outline-variant/60 p-5 md:p-8"><h2 className="mb-6 font-headline-display text-2xl text-primary">{tab === 'cart' ? 'Your saved cart' : tab === 'orders' ? 'Your orders' : 'Your appointments'}</h2>
      {tab === 'cart' ? <><p className="mb-5 text-sm text-on-surface-variant">{syncStatus === 'saved' ? 'Saved to your account. Sign in on another device to pick up here.' : syncStatus === 'saving' ? 'Saving your latest changes…' : 'Your cart is available below.'}</p>{items.length ? <ul className="mb-6 divide-y divide-outline-variant/40">{items.map((item) => <li key={item.key} className="flex justify-between gap-4 py-4 text-sm"><span>{item.product_name} <span className="text-on-surface-variant">· {item.variant_label} × {item.quantity}</span></span><span className="shrink-0 font-semibold">{formatPrice(item.unit_price_cents*item.quantity)}</span></li>)}</ul> : <p className="mb-6 text-sm text-on-surface-variant">Your next ritual starts with a little discovery. Your cart is empty for now.</p>}<Link href={items.length ? '/cart' : '/shop'} className={button}>{items.length ? 'Open my cart' : 'Explore the collection'}<ArrowRight className="h-4 w-4" /></Link></> : !customer.verified ? <p className="text-sm leading-7 text-on-surface-variant">Verify your email using the link we sent to securely view your {tab}. You can continue shopping and booking in the meantime.</p> : !history ? <p role="status" className="text-sm">{error ? 'Your history is temporarily unavailable.' : 'Loading your history…'}</p> : tab === 'bookings' ? history.bookings.length ? <ul className="divide-y divide-outline-variant/40">{history.bookings.map((booking) => <li key={booking.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-semibold text-primary">{booking.service}</p><p className="mt-2 text-sm text-on-surface-variant">{booking.date} · {booking.time} · Toronto time</p><p className="mt-1 text-xs capitalize">{booking.status.replaceAll('_', ' ')}</p></div><Link href={booking.url} className={secondary}>View appointment</Link></li>)}</ul> : <EmptyState title="A little time for your crown." text="When you book with this email, your appointments will appear here." href="/book" label="Book an appointment" /> : history.orders.length ? <ul className="divide-y divide-outline-variant/40">{history.orders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-semibold text-primary">Order #{order.reference}</p><p className="mt-2 text-sm text-on-surface-variant">{new Date(order.date).toLocaleDateString('en-CA')} · {formatPrice(order.total_cents)}</p><p className="mt-1 text-xs capitalize">{order.status.replaceAll('_', ' ')}</p></div><Link href={order.url} className={secondary}>View order</Link></li>)}</ul> : <EmptyState title="Your ritual, on its way." text="Orders placed with this email will appear here, ready whenever you need them." href="/shop" label="Shop haircare" />}
    </div>
    <p className="mt-6 text-xs leading-6 text-on-surface-variant">Bookings and orders are matched to your verified email. Used a different email? <Link className="text-primary underline" href="/contact">We can help.</Link></p>
  </section>
}

function EmptyState({ title, text, href, label }: { title: string; text: string; href: string; label: string }) {
  return <div className="py-6"><h3 className="font-headline-display text-xl text-primary">{title}</h3><p className="my-4 max-w-lg text-sm leading-7 text-on-surface-variant">{text}</p><Link href={href} className={button}>{label}<ArrowRight className="h-4 w-4" /></Link></div>
}
