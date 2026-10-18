'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import type { ReactNode } from 'react'

interface TiltCardProps {
  children: ReactNode
  /**
   * Maximum rotation in degrees. The doc fixes these per surface (§1.2.2–§1.2.5):
   * products 5°, services 4°, testimonials 3°.
   */
  maxTilt?: number
  className?: string
}

/**
 * Perspective tilt on pointer hover.
 *
 * Pointer position is held in motion values, not React state, so moving the mouse animates the
 * transform without re-rendering this component or anything below it.
 *
 * Returns a plain `div` when the user prefers reduced motion — no listeners are attached at all
 * (doc §1.1.5 requires parallax and tilt to be disabled, not merely shortened).
 */
export default function TiltCard({ children, maxTilt = 5, className = '' }: TiltCardProps) {
  const reduced = useReducedMotion()

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const spring = { stiffness: 220, damping: 22, mass: 0.6 }
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [maxTilt, -maxTilt]), spring)
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-maxTilt, maxTilt]), spring)

  if (reduced) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 1000, transformStyle: 'preserve-3d' }}
      onPointerMove={(e) => {
        // Ignore touch: a tilt that follows a finger fights the scroll gesture.
        if (e.pointerType === 'touch') return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left) / r.width - 0.5)
        y.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}
