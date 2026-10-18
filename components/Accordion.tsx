'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

export interface AccordionItem {
  id: string
  title: string
  content: ReactNode
}

/**
 * Disclosure list used by `/services` (doc §1.5) and `/faq` (doc §1.11).
 *
 * Built on real `<button>`s with `aria-expanded` and `aria-controls` rather than
 * `<details>`, because the open/close needs to animate and `<details>` cannot be transitioned
 * reliably across browsers. The panel keeps `role="region"` and is labelled by its trigger, so
 * a screen reader still announces it as a named, expandable region.
 */
export default function Accordion({
  items,
  allowMultiple = false,
  defaultOpenId,
}: {
  items: AccordionItem[]
  allowMultiple?: boolean
  defaultOpenId?: string
}) {
  const [open, setOpen] = useState<string[]>(defaultOpenId ? [defaultOpenId] : [])
  const reduced = useReducedMotion()

  const toggle = (id: string) =>
    setOpen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : allowMultiple ? [...prev, id] : [id],
    )

  return (
    <ul className="divide-y divide-outline-variant overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
      {items.map((item) => {
        const isOpen = open.includes(item.id)
        return (
          <li key={item.id}>
            <h3>
              <button
                type="button"
                id={`acc-trigger-${item.id}`}
                aria-expanded={isOpen}
                aria-controls={`acc-panel-${item.id}`}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-container-low"
              >
                <span className="font-body-md text-body-lg font-semibold text-on-surface">
                  {item.title}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-primary transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`acc-panel-${item.id}`}
                  role="region"
                  aria-labelledby={`acc-trigger-${item.id}`}
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 font-body-md text-body-md text-on-surface-variant">
                    {item.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        )
      })}
    </ul>
  )
}
