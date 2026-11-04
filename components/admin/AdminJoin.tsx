'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Field } from '@/components/FormField'
import { apiClient } from '@/lib/api/client'

export default function AdminJoin({ joinKey }: { joinKey: string }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiClient('/api/v1/admin/join', { method: 'POST', body: { email, join_key: joinKey } })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request access. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="flex min-h-screen items-center justify-center bg-surface-container-low p-5">
    <div className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest p-8">
      <h1 className="font-headline-display text-headline-md text-primary">Join Pholar Natural admin</h1>
      <p className="my-5 font-body-md text-body-md text-on-surface-variant">Enter your own email. We will send you a private link to verify it and choose your password. Administrator accounts have full dashboard access.</p>
      {sent ? <div role="status" className="rounded-xl bg-surface-container p-5"><h2 className="font-semibold text-primary">Check your email</h2><p className="mt-3">Open “Verify email and create my admin account” in your inbox. Check spam too. The email link works once within 48 hours. Already registered? Sign in or reset your password.</p><button onClick={() => setSent(false)} className="mt-4 font-semibold text-primary underline">Use a different email or request again</button></div> : <form onSubmit={submit} className="space-y-5">
        <Field label="Your email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
        {error && <p role="alert" className="text-error">{error}</p>}
        <button disabled={busy} className="w-full rounded-full bg-primary px-6 py-4 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send my verification link'}</button>
      </form>}
      <Link href="/admin/login" className="mt-6 block text-sm font-semibold text-primary underline">Admin sign in</Link>
    </div>
  </div>
}
