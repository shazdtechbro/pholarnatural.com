'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UserPlus, AlertCircle, CheckCircle2, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react'
import { Field } from '@/components/FormField'
import { adminRegister } from '@/lib/api/admin'

/** Admin account registration (requires the developer-issued secret key). */
export default function AdminRegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }

    setLoading(true)
    try {
      await adminRegister(email, password, secretKey)
      setSuccess(true)
      setTimeout(() => router.replace('/admin/login'), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-container-low p-5">
        <div className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-secondary" aria-hidden="true" />
          <h1 className="font-headline-md text-headline-md text-primary">Account created</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Redirecting you to sign in…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-container-low p-5">
      <div className="w-full max-w-md">
        <Link
          href="/admin/login"
          className="mb-6 inline-flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>

        <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-8">
          <div className="mb-8 text-center">
            <Image
              src="/logo.svg"
              alt=""
              width={48}
              height={48}
              className="mx-auto mb-4 h-12 w-12"
            />
            <h1 className="font-headline-display text-headline-md text-primary">
              Create admin account
            </h1>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              All admin accounts have full access to the dashboard.
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
              placeholder="you@pholarnatural.com"
            />

            <div className="relative">
              <Field
                label="Password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-9 text-on-surface-variant hover:text-primary"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            <Field
              label="Confirm password"
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setError(null)
              }}
              autoComplete="new-password"
              placeholder="Repeat your password"
            />

            <Field
              label="Secret key"
              type="password"
              required
              value={secretKey}
              onChange={(e) => {
                setSecretKey(e.target.value)
                setError(null)
              }}
              autoComplete="off"
              placeholder="Ask your developer for this key"
              hint="Contact your developer to obtain the registration secret key."
            />

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center font-body-md text-[13px] text-on-surface-variant">
            Already have an account?{' '}
            <Link
              href="/admin/login"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
