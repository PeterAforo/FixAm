"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/auth/supabase/client"
import { normalizeGhPhone } from "@/lib/phone"
import { postLoginDestination } from "@/lib/auth/destination"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/brand/card"
import { Wrench } from "lucide-react"

type Mode = "password" | "otp" | "signup"
type Step = "credentials" | "otp-sent"

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>("password")
  const [step, setStep] = useState<Step>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(await postLoginDestination())
    router.refresh()
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeGhPhone(phone)
    if (!normalized) {
      setError("Enter a valid Ghana number, e.g. 0241234567")
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep("otp-sent")
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeGhPhone(phone)
    if (!normalized) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: otp,
      type: "sms",
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(await postLoginDestination())
    router.refresh()
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    if (data.session) {
      router.push(await postLoginDestination())
      router.refresh()
      return
    }
    setNotice("Check your email to confirm your account, then sign in.")
  }

  const inputCls =
    "min-h-12 w-full rounded-lg border-2 border-border bg-surface px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-14 items-center justify-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-chunky-sm">
            <Wrench className="size-7" />
          </span>
          <CardTitle className="text-3xl">FixAm</CardTitle>
          <CardDescription>Sign in to your garage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-3 gap-2 rounded-pill border-2 border-border bg-muted p-1">
            {(["password", "otp", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setStep("credentials")
                  setError(null)
                  setNotice(null)
                }}
                className={`min-h-10 rounded-pill px-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  mode === m ? "bg-card text-foreground shadow-chunky-sm" : "text-muted-foreground"
                }`}
              >
                {m === "password" ? "Sign in" : m === "otp" ? "Phone" : "Sign up"}
              </button>
            ))}
          </div>

          {mode === "signup" ? (
            <form onSubmit={signUp} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Full name</span>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  className={inputCls}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Create account"}
              </Button>
            </form>
          ) : mode === "password" ? (
            <form onSubmit={signInWithPassword} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : step === "credentials" ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Phone number</span>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0241234567"
                  className={`${inputCls} font-mono`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  We&apos;ll text you a code. Ghana numbers only.
                </span>
              </label>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Code sent to <span className="font-mono font-bold">{phone}</span>
              </p>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">6-digit code</span>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                {loading ? "Verifying…" : "Verify & sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep("credentials")}
              >
                Use a different number
              </Button>
            </form>
          )}

          {notice && (
            <p className="mt-4 rounded-lg border-2 border-success bg-success/10 px-4 py-2 text-sm font-semibold text-success">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-lg border-2 border-danger bg-danger/10 px-4 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
