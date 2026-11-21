"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { requestPortalOtp, verifyPortalOtp, portalPasswordLogin } from "@/lib/portal/actions"

const inputCls = "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PortalLogin() {
  const [tab, setTab] = useState<"otp" | "password">("otp")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
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

  function passwordLogin(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await portalPasswordLogin({ identifier, password })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      window.location.reload()
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm"><CardContent className="p-6">
        <h1 className="font-display text-2xl font-bold">Customer portal</h1>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
          {(["otp", "password"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setMsg(null) }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {t === "otp" ? "Phone code" : "Username & password"}
            </button>
          ))}
        </div>

        {tab === "otp" && step === "phone" && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">Sign in with your Ghana phone number — new here? We&apos;ll set up your account after verification.</p>
            <form onSubmit={sendOtp} className="mt-4 space-y-3">
              <input className={inputCls} placeholder="024 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
              <Button type="submit" className="w-full" disabled={pending}>Send code</Button>
            </form>
          </>
        )}
        {tab === "otp" && step === "code" && (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code we sent to {phone}.</p>
            <input className={inputCls} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
            <Button type="submit" className="w-full" disabled={pending}>Verify &amp; sign in</Button>
            <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => { setStep("phone"); setMsg(null) }}>Use a different number</button>
          </form>
        )}
        {tab === "password" && (
          <form onSubmit={passwordLogin} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Sign in with your username or phone number and password.</p>
            <input className={inputCls} placeholder="Username or phone" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
            <input className={inputCls} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <Button type="submit" className="w-full" disabled={pending}>Sign in</Button>
          </form>
        )}
        {msg && <p className={`mt-3 text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      </CardContent></Card>
    </main>
  )
}
