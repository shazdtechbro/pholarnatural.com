import { redirect } from 'next/navigation'

/** All payment environments use the ordinary storefront and booking experience. */
export default function PaymentSandboxPage() {
  redirect('/shop')
}
