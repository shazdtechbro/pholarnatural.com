'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Menu, X, ShoppingBag, UserRound } from 'lucide-react'
import { useCart } from '@/context/CartContext'

/**
 * True once the page has scrolled past 8px — the navbar's glassmorphism intensifies then
 * (doc §1.1.1).
 *
 * `useSyncExternalStore` rather than a `scroll` listener writing to `useState`: the scroll
 * position is external state that React should subscribe to, and this form does not call
 * `setState` from an effect body on mount. `getServerSnapshot` returns false so the server
 * renders the un-scrolled navbar, which is always correct for a fresh page load.
 */
const subscribeScroll = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 8,
    () => false,
  )
}

const NAV_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/services', label: 'Services' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
] as const

export default function Navbar() {
  const pathname = usePathname()
  const { count, hydrated } = useCart()
  const scrolled = useScrolled()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  /*
   * Close the drawer on navigation, otherwise it stays open over the new page.
   *
   * Compared during render rather than in an effect: an effect would paint the new page once
   * with the drawer still covering it before closing it.
   */
  const [prevPath, setPrevPath] = useState(pathname)
  if (pathname !== prevPath) {
    setPrevPath(pathname)
    setOpen(false)
  }

  // Escape closes the drawer and returns focus to the control that opened it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-shadow duration-300 ${
        scrolled ? 'glass-effect shadow-sm' : 'bg-background'
      }`}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-16"
      >
        <Link href="/" className="flex items-center gap-2" aria-label="Pholar Natural — home">
          <Image src="/logo.svg" alt="" width={36} height={36} className="h-9 w-9" priority />
          <span className="font-headline-md text-[16px] font-bold text-primary sm:text-[20px] md:text-headline-md">
            Pholar Natural
          </span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`font-body-md text-body-md border-b-2 pb-1 transition-colors ${
                  isActive(link.href)
                    ? 'border-secondary font-bold text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/account" aria-label="My account" className="rounded-full p-2 text-primary hover:bg-surface-container-high/60"><UserRound className="h-5 w-5" aria-hidden="true" /></Link>
          <Link
            href="/cart"
            aria-label={
              hydrated && count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'
            }
            className="relative inline-flex items-center gap-2 rounded-full p-2 text-on-surface-variant transition-all hover:bg-surface-container-high/60 hover:text-primary"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            <span className="font-label-sm text-label-sm">Cart</span>
            {hydrated && count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>

          <Link
            href="/book"
            className="hidden rounded-full bg-secondary px-6 py-2 font-label-sm text-label-sm text-white transition-all hover:opacity-90 active:scale-95 md:block"
          >
            Book Now
          </Link>

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="rounded-full p-2 text-primary transition-colors hover:bg-surface-container-high/60 md:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/*
        Mobile drawer. Rendered but hidden rather than unmounted so the slide transition can run;
        `hidden` (via max-height + invisible) also removes it from the tab order when closed.
      */}
      <div
        id="mobile-menu"
        ref={panelRef}
        className={`overflow-hidden border-t border-outline-variant/60 bg-background transition-all duration-300 md:hidden ${
          open ? 'max-h-[32rem] visible' : 'invisible max-h-0'
        }`}
      >
        <ul className="flex flex-col px-5 py-2">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                tabIndex={open ? undefined : -1}
                className={`block border-b border-outline-variant/40 py-4 font-body-md text-body-md transition-colors ${
                  isActive(link.href) ? 'font-bold text-primary' : 'text-on-surface-variant'
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 px-5 pb-6">
          <Link href="/account" tabIndex={open ? undefined : -1} className="py-3 text-center font-semibold text-primary">My account · Sign in or create an account</Link>
          <Link
            href="/cart"
            tabIndex={open ? undefined : -1}
            className="rounded-full border-2 border-primary py-3 text-center font-label-sm text-label-sm text-primary"
          >
            Your Cart{hydrated && count > 0 ? ` (${count})` : ''}
          </Link>
          <Link
            href="/book"
            tabIndex={open ? undefined : -1}
            className="rounded-full bg-secondary py-3 text-center font-label-sm text-label-sm text-white"
          >
            Book Now
          </Link>
        </div>
      </div>
    </header>
  )
}
