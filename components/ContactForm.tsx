'use client'

import { useState } from 'react'
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Field, TextareaField } from '@/components/FormField'
import { submitContact } from '@/lib/api/contact'

type Errors = Partial<Record<'name' | 'email' | 'subject' | 'message', string>>

/** Contact form with validation and a success state (doc §1.12). */
export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)

  function validate() {
    const next: Errors = {}
    if (!name.trim()) next.name = 'Enter your name.'
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address.'
    if (!subject.trim()) next.subject = 'Enter a subject.'
    if (!message.trim()) next.message = 'Enter a message.'
    else if (message.trim().length < 10) next.message = 'Please give us a little more detail.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setStatus('sending')
    setSubmitError(null)
    try {
      await submitContact({ name, email, subject, message })
      setStatus('sent')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center"
      >
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden="true" />
        <h2 className="mb-2 font-headline-md text-headline-md text-primary">Message received</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Thanks {name.split(' ')[0]} — we&apos;ll get back to you within 24 hours at {email}.
        </p>
        <button
          type="button"
          onClick={() => {
            setName('')
            setEmail('')
            setSubject('')
            setMessage('')
            setStatus('idle')
          }}
          className="mt-6 rounded-full border border-outline px-6 py-3 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          Send another message
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {Object.keys(errors).length > 0 && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          Please correct the highlighted fields.
        </p>
      )}

      {status === 'error' && submitError && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {submitError}
        </p>
      )}

      <Field
        label="Your name"
        required
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />
      <Field
        label="Email address"
        type="email"
        required
        value={email}
        error={errors.email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <Field
        label="Subject"
        required
        value={subject}
        error={errors.subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <TextareaField
        label="Message"
        required
        rows={6}
        value={message}
        error={errors.message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button
        type="submit"
        disabled={status === 'sending'}
        onClick={() => {
          if (status === 'error') setStatus('idle')
        }}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-label-sm text-label-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {status === 'sending' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden="true" />
            Send Message
          </>
        )}
      </button>
    </form>
  )
}
