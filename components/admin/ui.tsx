'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Page title + optional action, shared by every admin screen. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-headline-display text-headline-lg-mobile text-primary">{title}</h1>
        {description && (
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{description}</p>
        )}
      </div>
      {action}
    </header>
  )
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="font-headline-display text-headline-md text-primary">{value}</p>
      {hint && <p className="mt-1 font-body-md text-[12px] text-on-surface-variant">{hint}</p>}
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  refunded: 'bg-primary/10 text-primary',
  refund_pending: 'bg-secondary-container text-on-secondary-container',
  paid: 'bg-primary/10 text-primary',
  confirmed: 'bg-primary/10 text-primary',
  processing: 'bg-secondary-container text-on-secondary-container',
  shipped: 'bg-secondary-container text-on-secondary-container',
  delivered: 'bg-primary/10 text-primary',
  completed: 'bg-primary/10 text-primary',
  pending: 'bg-surface-container-highest text-on-surface-variant',
  cancelled: 'bg-error-container text-on-error-container',
  active: 'bg-primary/10 text-primary',
  draft: 'bg-surface-container-highest text-on-surface-variant',
  expired: 'bg-error-container text-on-error-container',
}

/** Status pill. Carries its own text, never colour alone (doc §1.1.5). */
export function StatusBadge({ status }: { status: string }) {
  const tone =
    STATUS_TONE[status.toLowerCase()] ?? 'bg-surface-container-highest text-on-surface-variant'
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-3 py-1 font-label-sm text-[11px] font-bold uppercase ${tone}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  )
}

/** Scroll container for wide tables — the page body must never scroll sideways. */
export function TableWrap({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only-live">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`border-b border-outline-variant bg-surface-container-low p-4 font-label-sm text-label-sm uppercase tracking-wider text-primary ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={`border-b border-outline-variant/60 p-4 font-body-md text-body-md text-on-surface-variant ${className}`}
    >
      {children}
    </td>
  )
}

/**
 * Modal dialog used for add/edit forms and delete confirmations.
 *
 * Traps Tab inside itself, closes on Escape, and restores focus to whatever opened it — without
 * that last part a keyboard user is dumped back at the top of the document every time they
 * close a dialog.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement

    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'))

    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreTo.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-inverse-surface/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-surface-container-lowest p-6 shadow-2xl ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="font-headline-md text-headline-md text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-m-1 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Destructive-action confirmation (doc §1.14.2 requires one before every delete). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="flex items-start gap-3 font-body-md text-body-md text-on-surface-variant">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />
        {message}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-full bg-error py-3 font-label-sm text-label-sm text-on-error transition-opacity hover:opacity-90"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-outline py-3 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          Cancel
        </button>
      </div>
    </Modal>
  )
}

export function AdminButton({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  className = '',
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'ghost'
  className?: string
  disabled?: boolean
}) {
  const tone =
    variant === 'primary'
      ? 'bg-primary text-white hover:opacity-90'
      : variant === 'secondary'
        ? 'border border-outline text-on-surface-variant hover:bg-surface-container-high'
        : 'text-on-surface-variant hover:bg-surface-container-high'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-label-sm text-label-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${className}`}
    >
      {children}
    </button>
  )
}

/** Shown when a table has no rows — a blank table reads as a broken page (doc §1.1.4). */
export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon
  title: string
  message: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant py-16 text-center">
      <Icon className="mx-auto mb-4 h-10 w-10 text-outline" aria-hidden="true" />
      <h2 className="mb-2 font-headline-md text-headline-md text-primary">{title}</h2>
      <p className="font-body-md text-body-md text-on-surface-variant">{message}</p>
    </div>
  )
}
