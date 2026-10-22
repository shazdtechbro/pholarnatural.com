'use client'
import { useState, type InputHTMLAttributes } from 'react'
import { Field } from '@/components/FormField'

export default function PasswordField(props: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const [visible, setVisible] = useState(false)
  return <div><Field {...props} type={visible ? 'text' : 'password'} /><button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)} className="mt-2 text-sm font-semibold text-primary underline underline-offset-4">{visible ? 'Hide password' : 'Show password'}</button></div>
}
