'use client'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

type Admin = { id: string; email: string; is_active: boolean }
export default function AdminTeam() {
  const [team, setTeam] = useState<Admin[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { apiClient<Admin[]>('/api/v1/admin/team', { auth: true }).then(setTeam).catch(() => setNotice('Could not load administrators. Refresh to retry.')) }, [])
  async function invite() {
    setBusy(true); setNotice('')
    try {
      await apiClient('/api/v1/admin/invitations', { method: 'POST', auth: true, body: { email, current_password: password } })
      setNotice('Invitation email queued. It expires in 48 hours. The recipient chooses their own password.'); setEmail(''); setPassword('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not invite this administrator.') }
    finally { setBusy(false) }
  }
  async function access(admin: Admin) {
    if (!password) { setNotice('Enter your current password to change admin access.'); return }
    setBusy(true)
    try {
      await apiClient(`/api/v1/admin/team/${admin.id}/access`, { method:'POST', auth:true, body:{is_active:!admin.is_active,current_password:password} })
      setTeam(await apiClient<Admin[]>('/api/v1/admin/team', {auth:true})); setPassword(''); setNotice('Admin access updated. Existing sessions were revoked.')
    } catch(error) { setNotice(error instanceof Error ? error.message : 'Could not update access.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-outline-variant bg-white p-6">
    <h2 className="font-headline-display text-2xl text-primary">Your admin team</h2>
    <p className="my-3 text-sm leading-6">Every active administrator receives order and booking alerts at their account email. Invite trusted people only: every administrator has full dashboard access.</p>
    <ul className="mb-5 space-y-2 text-sm">{team.map(admin => <li key={admin.id}>{admin.email} · {admin.is_active ? 'Active' : 'Inactive'} <button type="button" disabled={busy} onClick={() => access(admin)} className="ml-3 underline">{admin.is_active ? 'Disable access' : 'Enable access'}</button></li>)}</ul>
    <label className="block text-sm">New administrator email<input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 block w-full rounded-xl border p-3" autoComplete="off" /></label>
    <label className="mt-4 block text-sm">Your current password<input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 block w-full rounded-xl border p-3" autoComplete="current-password" /></label>
    <button type="button" disabled={busy || !email || !password} onClick={invite} className="mt-4 rounded-full bg-primary px-6 py-3 text-white disabled:opacity-50">{busy ? 'Queuing invitation…' : 'Email an admin invitation'}</button>
    {notice && <p role="status" className="mt-3 text-sm leading-6">{notice}</p>}
  </section>
}
