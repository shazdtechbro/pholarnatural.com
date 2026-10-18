import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
  alternates: { canonical: '/checkout/success' },
}
export default function ConfirmationLayout({ children }: { children: React.ReactNode }) {
  return children
}
