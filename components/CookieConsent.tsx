'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Cookie, X } from 'lucide-react'
import { useHydrated } from '@/lib/use-hydrated'

const STORAGE_KEY = 'pholar-cookie-consent-v1'

interface Consent {
  essential: true
  analytics: boolean
  marketing: boolean
  decidedAt: string
}

/**
 * Cookie consent banner and preferences modal (doc §1.1.3).
 *
 * Nothing renders until localStorage has been read, so a returning visitor who has already
 * decided never sees a flash of the banner.
 *
 * Essential cookies are shown as a locked, checked control rather than hidden — the user should
 * be able to see what is being set on their behalf even when they cannot switch it off.
 */
export default function CookieConsent() {
  // Seeded lazily on the first client render; `hydrated` keeps the banner hidden until after
  // hydration, so a returning visitor never sees it flash.
  const [decided, setDecided] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) !== null
    } catch {
      return false
    }
  })
  const hydrated = useHydrated()
  const [showPrefs, setShowPrefs] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const reduced = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showPrefs) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPrefs(false)
      if (e.key !== 'Tab') return
      // Focus trap: keep Tab inside the dialog while it is open.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showPrefs])

  const save = (next: { analytics: boolean; marketing: boolean }) => {
    const consent: Consent = {
      essential: true,
      ...next,
      decidedAt: new Date().toISOString(),
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
    } catch {
      // A browser storage restriction must not prevent guest shopping.
    }
    setDecided(true)
    setShowPrefs(false)
  }

  if (!hydrated || decided) return null

  return (
    <>
      <AnimatePresence>
        {!showPrefs && (
          <motion.aside
            role="region"
            aria-label="Cookie consent"
            initial={reduced ? false : { y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-[55] border-t border-outline-variant glass-effect"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:px-16">
              <Cookie
                className="hidden h-6 w-6 shrink-0 text-secondary md:block"
                aria-hidden="true"
              />
              <p className="font-body-md text-body-md flex-1 text-on-surface-variant">
                We use cookies to keep your cart working, understand how the site is used, and
                improve your experience. Read our{' '}
                <Link
                  href="/privacy-policy"
                  className="font-semibold text-primary underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => save({ analytics: false, marketing: false })}
                  className="rounded-full border border-outline px-5 py-2.5 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrefs(true)}
                  className="rounded-full border border-primary px-5 py-2.5 font-label-sm text-label-sm text-primary transition-colors hover:bg-primary/5"
                >
                  Manage Preferences
                </button>
                <button
                  type="button"
                  onClick={() => save({ analytics: true, marketing: true })}
                  className="rounded-full bg-primary px-5 py-2.5 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
                >
                  Accept All
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPrefs && (
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-inverse-surface/40 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cookie-prefs-title"
              initial={reduced ? false : { y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: 24, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <h2
                  id="cookie-prefs-title"
                  className="font-headline-md text-headline-md text-primary"
                >
                  Cookie preferences
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setShowPrefs(false)}
                  aria-label="Close cookie preferences"
                  className="-m-1 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-3">
                <ToggleRow
                  id="cookie-essential"
                  title="Essential"
                  description="Required for the cart, checkout and security. These cannot be switched off."
                  checked
                  locked
                />
                <ToggleRow
                  id="cookie-analytics"
                  title="Analytics"
                  description="Anonymous usage statistics that tell us which pages are working."
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <ToggleRow
                  id="cookie-marketing"
                  title="Marketing"
                  description="Used to measure campaigns and show relevant offers."
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => save({ analytics, marketing })}
                  className="flex-1 rounded-full bg-primary px-6 py-3 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90"
                >
                  Save preferences
                </button>
                <button
                  type="button"
                  onClick={() => save({ analytics: false, marketing: false })}
                  className="flex-1 rounded-full border border-outline px-6 py-3 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
                >
                  Reject non-essential
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  locked = false,
  onChange,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  locked?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)] disabled:opacity-60"
      />
      <div className="flex-1">
        <label htmlFor={id} className="font-body-md text-body-md font-semibold text-on-surface">
          {title}
          {locked && (
            <span className="ml-2 font-label-sm text-[11px] uppercase text-on-surface-variant">
              Always on
            </span>
          )}
        </label>
        <p className="font-body-md text-[13px] text-on-surface-variant">{description}</p>
      </div>
    </div>
  )
}
