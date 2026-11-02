'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { useHydrated } from '@/lib/use-hydrated'

export default function AdminRecovery({reset=false}:{reset?:boolean}) {
  const hydrated = useHydrated()
  return hydrated ? <RecoveryForm reset={reset} /> : <p className="p-8">Loading password recovery…</p>
}

function RecoveryForm({reset}:{reset:boolean}) {
  const [email,setEmail]=useState(''), [password,setPassword]=useState(''), [token]=useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  useEffect(()=>{window.history.replaceState(null,'',window.location.pathname)},[])
  async function submit(event:React.FormEvent){
    event.preventDefault();setBusy(true);setMessage('')
    try{await apiClient('/api/v1/admin/'+(reset?'reset-password':'forgot-password'),{method:'POST',body:reset?{token,password}:{email}});setMessage(reset?'Your password changed. Sign in with your new password.':'If this is an active admin account, a reset email will arrive shortly. Check spam too.');setPassword('')}
    catch(error){setMessage(error instanceof Error?error.message:'Could not complete this request. Please retry.')}
    finally{setBusy(false)}
  }
  return <main className="flex min-h-screen items-center justify-center bg-background px-5"><div className="w-full max-w-md rounded-3xl border border-outline-variant bg-white p-8"><h1 className="font-headline-display text-3xl text-primary">{reset?'Choose a new password':'Reset your admin password'}</h1><p className="my-5 text-sm leading-6">{reset?'Use at least 12 characters. This link works once and expires after 30 minutes.':'Enter your admin account email. We will send a private link to your inbox.'}</p><form onSubmit={submit} className="space-y-4">{reset?<label className="block text-sm">New password<input required minLength={12} maxLength={72} type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>:<label className="block text-sm">Email address<input required type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>}<button disabled={busy||(reset&&!token)} className="w-full rounded-full bg-primary p-3 text-white disabled:opacity-50">{busy?'Please wait…':reset?'Save new password':'Email my reset link'}</button></form>{message&&<p role="status" className="mt-4 text-sm leading-6">{message}</p>}<Link href="/admin/login" className="mt-6 block text-sm text-primary underline">Back to admin sign in</Link></div></main>
}
