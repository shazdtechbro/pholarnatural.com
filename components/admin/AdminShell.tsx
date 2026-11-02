'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Package,
  Scissors,
  CalendarDays,
  Receipt,
  TicketPercent,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react'
import { useAdminAuth } from '@/context/AdminAuthContext'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/services', label: 'Services', icon: Scissors },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/admin/orders', label: 'Orders', icon: Receipt },
  { href: '/admin/discounts', label: 'Discounts', icon: TicketPercent },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
] as const

/** Navigation guard; every protected backend request independently validates the admin session. */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { authenticated, ready, signOut } = useAdminAuth()
  const [open, setOpen] = useState(false)

  const isPublicPage = pathname === '/admin/login' || pathname === '/admin/register' || pathname === '/admin/forgot-password' || pathname === '/admin/reset-password'

  useEffect(() => {
    if (ready && !authenticated && !isPublicPage) router.replace('/admin/login')
  }, [ready, authenticated, isPublicPage, router])

  // Close the sidebar on navigation. Compared during render rather than in an effect, so the
  // new page never paints with the drawer still over it.
  const [prevPath, setPrevPath] = useState(pathname)
  if (pathname !== prevPath) {
    setPrevPath(pathname)
    setOpen(false)
  }

  if (isPublicPage) return <>{children}</>

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <p className="font-body-md text-body-md text-on-surface-variant">Checking your session…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-surface-container-low">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-outline-variant bg-surface-container-lowest transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-outline-variant p-5">
            <Image src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-headline-md text-body-lg font-bold text-primary">Admin</span>
          </div>

          <nav aria-label="Admin" className="flex-1 overflow-y-auto p-3">
            <ul className="space-y-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 font-body-md text-body-md transition-colors ${
                        active
                          ? 'bg-primary text-white'
                          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="space-y-1 border-t border-outline-variant p-3">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              <ExternalLink className="h-5 w-5 shrink-0" aria-hidden="true" />
              View storefront
            </Link>
            <button
              type="button"
              onClick={() => {
                signOut()
                router.replace('/admin/login')
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-inverse-surface/40 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="rounded-full p-2 text-primary hover:bg-surface-container-high"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
          <span className="font-headline-md text-body-lg font-bold text-primary">Admin</span>
        </header>

        <main id="admin-main" className="min-w-0 flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
