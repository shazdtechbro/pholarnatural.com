'use client'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'
export default function EmailStatus() {
  const [status, setStatus] = useState<{
    configured: boolean
    admin_recipient_configured: boolean
    queued: number
    sent: number
    retrying: number
  } | null>(null)
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const load = () =>
      apiClient<NonNullable<typeof status>>('/api/v1/admin/email/status', { auth: true })
        .then(setStatus)
        .catch(() => setMessage('Could not load email status.'))
    void load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])
  async function test() {
    setBusy(true)
    try {
      await apiClient('/api/v1/admin/email/test', { method: 'POST', auth: true })
      setMessage(
        'Test email queued for your admin account. Check your inbox and delivery status shortly.',
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not queue test email.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="my-4 space-y-3">
      <p>
        {status
          ? `${status.configured ? 'Email provider configured' : 'Email provider not configured'} · ${status.admin_recipient_configured ? 'Admin recipients configured' : 'Admin recipients not configured'}`
          : 'Checking email delivery…'}
      </p>
      {status && (
        <p>
          {status.queued} queued · {status.retrying} retrying · {status.sent} accepted by provider
        </p>
      )}
      <button
        type="button"
        disabled={busy || !status?.configured}
        onClick={test}
        className="rounded-full border px-5 py-2"
      >
        {busy ? 'Sending…' : 'Send test email'}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  )
}
