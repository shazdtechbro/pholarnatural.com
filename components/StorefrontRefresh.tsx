'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Refresh shared server layouts after admin changes, including across browser tabs. */
export default function StorefrontRefresh() {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 30000)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [router])
  return null
}
