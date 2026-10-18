'use client'

import { useReducedMotion } from '@/lib/use-reduced-motion'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

/**
 * Hero image rotation (5 slides).
 *
 * ALT TEXT NEEDS CHECKING — these describe the photos only in general terms because they were
 * written without sight of the final images. Replace each one with what the photo actually
 * shows; a screen reader user gets nothing useful from five near-identical descriptions.
 */
const SLIDES = [
  { src: '/images/hero/hero-1.webp', alt: 'Natural hair styled at the Pholar Natural studio' },
  { src: '/images/hero/hero-2.webp', alt: 'Close-up of textured natural hair' },
  { src: '/images/hero/hero-3.webp', alt: 'Braided natural hairstyle' },
  { src: '/images/hero/hero-4.webp', alt: 'Twisted natural hairstyle' },
  { src: '/images/hero/hero-5.webp', alt: 'Finished natural hair look' },
  { src: '/images/hero/hero-6.webp', alt: 'Portrait of natural hair styled at Pholar Natural' },
  { src: '/images/hero/hero-7.webp', alt: 'Natural hairstyle detail' },
]

const COUNT = SLIDES.length
const INTERVAL_MS = 2000
const SLIDE_SECONDS = 0.55

/**
 * How far a slide sits from the one on screen, as a signed number of screen-widths, taking the
 * shortest way round the loop. For five slides this gives -2, -1, 0, 1, 2.
 *
 * Wrapping matters: without it, moving from the last slide back to the first would rewind the
 * whole strip backwards past every other image. With it, the first slide is simply waiting
 * one screen-width to the right, so the rotation always travels the same direction.
 */
function offsetFor(i: number, index: number) {
  const half = Math.floor(COUNT / 2)
  return ((i - index + COUNT + half) % COUNT) - half
}

export default function HeroCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useReducedMotion()
  const touchStartX = useRef<number | null>(null)

  const go = useCallback((next: number) => setIndex((next + COUNT) % COUNT), [])

  /*
   * Auto-advance. Disabled entirely under prefers-reduced-motion — a hero that moves on its own
   * is exactly the kind of unrequested motion that setting exists to stop (doc §1.1.5).
   * Pauses on hover and on keyboard focus so it cannot slide out from under someone reading it
   * or tabbing through the dots.
   */
  useEffect(() => {
    if (reduced || paused) return
    const t = setInterval(() => setIndex((i) => (i + 1) % COUNT), INTERVAL_MS)
    return () => clearInterval(t)
  }, [reduced, paused])

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      role="region"
      aria-roledescription="carousel"
      aria-label="Pholar Natural hair gallery"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
        touchStartX.current = null
      }}
    >
      {SLIDES.map((slide, i) => {
        const offset = offsetFor(i, index)
        // Only the outgoing and incoming slides animate. The ones two places away are off
        // screen and jump straight to their new side — animating those would send a stray
        // image flying across the frame every time the loop wraps.
        const animates = Math.abs(offset) <= 1
        return (
          <motion.div
            key={slide.src}
            className="absolute inset-0"
            initial={false}
            animate={{ x: `${offset * 100}%` }}
            transition={
              reduced || !animates
                ? { duration: 0 }
                : { duration: SLIDE_SECONDS, ease: [0.32, 0.72, 0, 1] }
            }
            aria-hidden={i !== index}
          >
            <Image
              src={slide.src}
              alt={i === index ? slide.alt : ''}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              // Only the first slide blocks the LCP; the rest are already in the viewport
              // so they fetch immediately behind it and are ready before their turn.
              priority={i === 0}
              className="object-cover"
            />
          </motion.div>
        )
      })}

      {/* Scrim keeps the dots legible over a light photo. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-black/40 to-transparent"
        aria-hidden="true"
      />

      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show image ${i + 1} of ${COUNT}`}
            aria-current={i === index ? 'true' : undefined}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
            }`}
          />
        ))}
      </div>

      {/* Announces the change without moving focus. */}
      <p className="sr-only-live" aria-live="polite">
        Image {index + 1} of {COUNT}
      </p>
    </div>
  )
}
