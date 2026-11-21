"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { completePortalRegistration } from "@/lib/portal/profile-actions"

const inputCls =
  "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PortalRegister({ phone }: { phone: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await completePortalRegistration({ fullName, email, marketingOptIn, acceptTerms })
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create your FixAm account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-mono font-bold">{phone}</span>. Tell us your name to unlock your garage history, bookings and vehicle tools.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Full name *</span>
              <input className={inputCls} required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Kwame Mensah" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Email (optional)</span>
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
              <span className="text-muted-foreground">Send me service reminders and garage offers by email/SMS.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span className="text-muted-foreground">
                I agree to the terms of service and understand my data is handled per the Ghana Data Protection Act.
              </span>
            </label>
            {error && <p className="rounded-lg border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending || !acceptTerms}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
