"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { mockPayRepayment } from "@/lib/financing/actions"

export function MockPayButton({ providerRef, sequence }: { providerRef: string; sequence: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  return (
    <div className="mt-5 space-y-3">
      {!done ? (
        <Button className="w-full" disabled={pending} onClick={() => start(async () => {
          const r = await mockPayRepayment({ providerRef, sequence })
          if (r.ok) setDone(true)
          else setMsg(r.error)
        })}>Mark as paid</Button>
      ) : (
        <p className="text-sm font-semibold text-emerald-700">Marked as paid.</p>
      )}
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <Link href="/portal/financing" className="block text-sm underline">Back to my plans</Link>
    </div>
  )
}
