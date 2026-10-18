'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

interface RevealOnScrollProps {
  children: ReactNode
  /** Stagger index — each step delays the reveal by 80ms. */
  index?: number
  direction?: 'up' | 'left' | 'right' | 'none'
  className?: string
  as?: 'div' | 'section' | 'li' | 'article'
}

const OFFSET: Record<NonNullable<RevealOnScrollProps['direction']>, { x: number; y: number }> = {
  up: { x: 0, y: 24 },
  left: { x: -24, y: 0 },
  right: { x: 24, y: 0 },
  none: { x: 0, y: 0 },
}

/**
 * Fades content in once, the first time it enters the viewport.
 *
 * `once: true` matters for more than taste — re-animating on every scroll past makes long pages
 * feel unstable and repeatedly moves focus targets under the user.
 *
 * Renders children unwrapped in their normal position when reduced motion is preferred, so the
 * content is never left invisible waiting for an animation that will not run.
 */
export default function RevealOnScroll({
  children,
  index = 0,
  direction = 'up',
  className = '',
  as = 'div',
}: RevealOnScrollProps) {
  const reduced = useReducedMotion()
  const Tag = motion[as]

  if (reduced) {
    const Plain = as
    return <Plain className={className}>{children}</Plain>
  }

  const { x, y } = OFFSET[direction]

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  )
}
