"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { requestPortalOtp, verifyPortalOtp } from "@/lib/portal/actions"

const inputCls = "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PortalLogin() {
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await requestPortalOtp({ phone })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      setStep("code")
      setMsg({ ok: true, text: "Code sent — check your SMS." })
    })
  }

  function verify(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await verifyPortalOtp({ phone, code })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      window.location.reload()
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm"><CardContent className="p-6">
        <h1 className="font-display text-2xl font-bold">Customer portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "phone" ? "Sign in with the phone number your garage has on file." : "Enter the 6-digit code we sent you."}
        </p>
        {step === "phone" ? (
          <form onSubmit={sendOtp} className="mt-4 space-y-3">
            <input className={inputCls} placeholder="024 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
            <Button type="submit" className="w-full" disabled={pending}>Send code</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <input className={inputCls} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
            <Button type="submit" className="w-full" disabled={pending}>Verify &amp; sign in</Button>
            <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => { setStep("phone"); setMsg(null) }}>Use a different number</button>
          </form>
        )}
        {msg && <p className={`mt-3 text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      </CardContent></Card>
    </main>
  )
}
