'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { useHydrated } from '@/lib/use-hydrated'
import {
  adminLogin as apiAdminLogin,
  adminLogout as apiAdminLogout,
  setAdminToken,
  clearAdminToken,
} from '@/lib/api/admin'

const TOKEN_KEY = 'pholar_admin_token'

interface AdminAuthContextValue {
  authenticated: boolean
  /** False until sessionStorage has been read; gate rendering on this to avoid a flash. */
  ready: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(
    () => typeof window !== 'undefined' && !!window.sessionStorage.getItem(TOKEN_KEY),
  )
  const ready = useHydrated()
  useEffect(() => {
    const expired = () => setAuthenticated(false)
    window.addEventListener('pholar:unauthorized', expired)
    return () => window.removeEventListener('pholar:unauthorized', expired)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const token = await apiAdminLogin(email, password)
    setAdminToken(token)
    setAuthenticated(true)
  }, [])

  const signOut = useCallback(() => {
    apiAdminLogout()
    clearAdminToken()
    setAuthenticated(false)
  }, [])

  const value = useMemo(
    () => ({ authenticated, ready, signIn, signOut }),
    [authenticated, ready, signIn, signOut],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>')
  return ctx
}
