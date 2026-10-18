'use client'
import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { useAdminAuth } from '@/context/AdminAuthContext'
export default function PasswordChange() {
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const { signOut } = useAdminAuth()
  async function change() {
    setBusy(true)
    setError('')
    try {
      await apiClient('/api/v1/admin/password', {
        method: 'POST',
        auth: true,
        body: { current_password: current, new_password: password },
      })
      signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-2xl border p-6">
      <h2 className="font-headline-md">Account security</h2>
      <p className="my-3">Changing your password signs out all admin sessions.</p>
      <label className="block">
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="my-2 block w-full rounded border p-3"
        />
      </label>
      <label className="block">
        New password (at least 12 characters)
        <input
          type="password"
          minLength={12}
          maxLength={72}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="my-2 block w-full rounded border p-3"
        />
      </label>
      <button
        type="button"
        disabled={busy || password.length < 12 || !current}
        onClick={change}
        className="rounded-full border px-5 py-3"
      >
        {busy ? 'Updating…' : 'Change password'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
