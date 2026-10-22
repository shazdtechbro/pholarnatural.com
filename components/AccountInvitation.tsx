'use client'
import Link from 'next/link'
import { useCustomer } from '@/context/CustomerContext'

export default function AccountInvitation() {
  const { customer } = useCustomer()
  return <aside className="my-8 rounded-2xl bg-primary/5 p-6"><h2 className="font-headline-display text-xl text-primary">{customer ? 'Keep everything close.' : 'Come back to your ritual.'}</h2><p className="my-3 text-sm leading-7 text-on-surface-variant">{customer ? 'View your saved cart, bookings and orders in your account.' : 'Create an optional account to save your cart across devices and see bookings and orders made with your verified email.'}</p><Link href={customer ? '/account' : '/account/register'} className="text-sm font-semibold text-primary underline underline-offset-4">{customer ? 'Go to my account' : 'Create an account'}</Link></aside>
}
