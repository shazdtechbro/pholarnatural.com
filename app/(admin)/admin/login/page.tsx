'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Lock, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { Field } from '@/components/FormField'
import { useAdminAuth } from '@/context/AdminAuthContext'

/** Admin sign-in (doc §1.14.1 / §2.0 task 4.2). */
export default function AdminLoginPage() {
  const router = useRouter()
  const { signIn, authenticated, ready } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (ready && authenticated) router.replace('/admin')
  }, [ready, authenticated, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      router.replace('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-container-low p-5">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to storefront
        </Link>

        <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-8">
          <div className="mb-8 text-center">
            <Image src="/logo.svg" alt="" width={48} height={48} className="mx-auto mb-4 h-12 w-12" />
            <h1 className="font-headline-display text-headline-md text-primary">Pholar Natural Admin</h1>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Sign in to manage products, services, bookings and orders.
            </p>
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container"
              >
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <Field
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              autoComplete="username email"
              placeholder="admin@pholarnatural.com"
            />

            <Field
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              autoComplete="current-password"
              placeholder="••••••••"
            />

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <Link href="/admin/forgot-password" className="mt-5 block text-center text-sm text-primary underline">Forgot your password?</Link>

          <p className="mt-6 text-center font-body-md text-[13px] text-on-surface-variant">
            Need an account?{' '}
            <Link href="/admin/register" className="text-primary underline underline-offset-4 hover:opacity-80">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
