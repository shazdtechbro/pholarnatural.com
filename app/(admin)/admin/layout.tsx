import PaymentModeNotice from '@/components/PaymentModeNotice'
import type { Metadata } from 'next'
import AdminShell from '@/components/admin/AdminShell'
import { AdminAuthProvider } from '@/context/AdminAuthContext'

/** The admin area must never be indexed. */
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Pholar Natural Admin' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell><PaymentModeNotice />{children}</AdminShell>
    </AdminAuthProvider>
  )
}
