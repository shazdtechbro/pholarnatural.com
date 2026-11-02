'use client'
import { useEffect, useState } from 'react'
const base = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pholarnatural.com').replace(/\/$/, '')
export default function PaymentModeNotice() {
  const [test, setTest] = useState(false)
  useEffect(() => { const controller = new AbortController(); fetch(base+'/api/v1/payments/info', { cache:'no-store', signal:controller.signal }).then(r => r.ok ? r.json() : null).then(info => setTest(Boolean(info?.test_mode))).catch(() => {}); return () => controller.abort() }, [])
  return test ? <div role="status" className="bg-primary px-5 py-3 text-center text-sm font-semibold text-white">Test payments only · Use a test card · No real money · Do not fulfil test orders. Catalogue prices are USD.</div> : null
}
