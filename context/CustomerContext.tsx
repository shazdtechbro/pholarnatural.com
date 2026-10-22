'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { accountApi, AccountError, type Customer } from '@/lib/api/customer'

interface CustomerState {
  customer: Customer | null
  ready: boolean
  unavailable: boolean
  refresh: () => Promise<void>
  authenticate: (mode: 'login' | 'register', values: { email: string; password: string; name?: string }) => Promise<void>
  signOut: () => Promise<void>
}
const Context = createContext<CustomerState | null>(null)

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const refresh = useCallback(async () => {
    try {
      setCustomer(await accountApi<Customer>('/me'))
      setUnavailable(false)
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) { setCustomer(null); setUnavailable(false) }
      else setUnavailable(true)
    } finally { setReady(true) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void accountApi<Customer>('/me').then((value) => { if (!controller.signal.aborted) { setCustomer(value); setReady(true) } }).catch((error) => { if (!controller.signal.aborted) { setUnavailable(!(error instanceof AccountError && error.status === 401)); setReady(true) } }); return () => controller.abort() }, [])
  useEffect(() => { const focus = () => { void refresh() }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus) }, [refresh])
  const authenticate = async (mode: 'login' | 'register', values: { email: string; password: string; name?: string }) => {
    setCustomer(await accountApi<Customer>(`/${mode}`, values))
    setUnavailable(false)
  }
  const signOut = async () => {
    await accountApi('/logout', {})
    setCustomer(null)
  }
  return <Context.Provider value={{ customer, ready, unavailable, refresh, authenticate, signOut }}>{children}</Context.Provider>
}

export function useCustomer() {
  const context = useContext(Context)
  if (!context) throw new Error('CustomerProvider is required')
  return context
}
