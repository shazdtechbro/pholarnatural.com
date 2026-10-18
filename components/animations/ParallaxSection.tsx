'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import { motion, useScroll, useTransform } from 'motion/react'
import { useRef, type ReactNode } from 'react'

interface ParallaxSectionProps {
  children: ReactNode
  /**
   * Pixels of vertical drift across the full scroll pass. Negative values move the layer up
   * (faster than the page), positive values move it down (slower).
   */
  offset?: number
  className?: string
}

/**
 * Scroll-linked vertical parallax for a layer.
 *
 * Driven by `useScroll` against the element itself, so the drift is tied to the element's own
 * position rather than to a global scroll listener — no `scroll` handler, no state updates.
 *
 * Disabled entirely under `prefers-reduced-motion` (doc §1.1.5).
 */
export default function ParallaxSection({
  children,
  offset = 60,
  className = '',
}: ParallaxSectionProps) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset])

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y: reduced ? 0 : y }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  )
}

/**
 * The blurred organic blobs behind the hero and CTA.
 *
 * The original homepage moved these with a `mousemove` listener that called `setState` on every
 * pixel, re-rendering the whole page. This drifts them on scroll instead — same visual intent,
 * no React work per frame.
 */
export function ParallaxBlob({
  className = '',
  offset = 40,
  delay = '0s',
}: {
  className?: string
  offset?: number
  delay?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset])

  if (reduced) return null

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <motion.div style={{ y, animationDelay: delay }} className={`parallax-blob ${className}`} />
    </div>
  )
}
