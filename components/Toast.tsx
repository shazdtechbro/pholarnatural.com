'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToast, type ToastVariant } from '@/context/ToastContext'

const ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const

const TONE: Record<ToastVariant, string> = {
  success: 'border-primary/25 text-primary',
  error: 'border-error/30 text-error',
  info: 'border-outline-variant text-on-surface',
}

/**
 * Toast viewport (doc §1.1.4).
 *
 * The list is an `aria-live="polite"` region so cart additions and form results are announced
 * to screen readers rather than only appearing visually (doc §1.1.5). `role="status"` on each
 * toast keeps the announcement scoped to the individual message.
 */
export default function ToastViewport() {
  const { toasts, dismiss } = useToast()
  const reduced = useReducedMotion()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-3 p-4 sm:items-end sm:p-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.variant]
          return (
            <motion.div
              key={t.id}
              role="status"
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface-container-lowest p-4 shadow-lg shadow-primary/10 ${TONE[t.variant]}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="font-body-md text-body-md flex-1 text-on-surface">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-m-1 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
