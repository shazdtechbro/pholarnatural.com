'use client'
export default function StoreError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl px-5 py-20 text-center" role="alert">
      <h1 className="text-headline-md text-primary">We could not load this page</h1>
      <p className="my-5">Please try again in a moment. Your cart is saved on this device.</p>
      <button onClick={reset} className="rounded-full bg-primary px-6 py-3 text-white">
        Try again
      </button>
    </section>
  )
}
