"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/auth/supabase/client"
import { normalizeGhPhone } from "@/lib/phone"
import { postLoginDestination } from "@/lib/auth/destination"
import Link from "next/link"
import { Button } from "@/components/brand/button"
import { Logo } from "@/components/marketing/logo"
import { cn } from "@/lib/utils"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"
import { photos } from "@/lib/images"

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
    "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
  const labelCls = "text-sm font-medium"

  function switchMode(m: Mode) {
    setMode(m)
    setStep("credentials")
    setError(null)
    setNotice(null)
  }

  const heading =
    mode === "signup" ? "Create your account" : step === "otp-sent" ? "Enter your code" : "Welcome back"
  const subheading =
    mode === "signup"
      ? "Start your 14-day free trial. No card needed."
      : step === "otp-sent"
        ? "We sent a 6-digit code by SMS."
        : "Sign in to your garage workspace."

  return (
    <main className="flex min-h-screen flex-wrap bg-card">
      {/* Form side */}
      <section className="flex min-w-0 flex-[1_1_520px] flex-col px-6 py-8 md:px-12">
        <Logo />
        <div className="mx-auto my-auto flex w-full max-w-[400px] flex-col gap-7 py-12">
          <div>
            <h1 className="font-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">{heading}</h1>
            <p className="mt-2.5 text-base text-muted-foreground">{subheading}</p>
          </div>

          {mode !== "signup" && step === "credentials" && (
            <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 rounded-xl bg-[#F4F0EA] p-1">
              {(["password", "otp"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    "h-10 rounded-[9px] text-sm transition-colors",
                    mode === m ? "bg-card font-semibold text-foreground shadow-1" : "font-medium text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "password" ? "Email" : "Phone code"}
                </button>
              ))}
            </div>
          )}

          {mode === "signup" ? (
            <form onSubmit={signUp} className="space-y-[18px]">
              <label className="block space-y-2">
                <span className={labelCls}>Full name</span>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  className={inputCls}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className={labelCls}>Work email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@yourgarage.com"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className={labelCls}>Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Create account"}
              </Button>
            </form>
          ) : mode === "password" ? (
            <form onSubmit={signInWithPassword} className="space-y-[18px]">
              <label className="block space-y-2">
                <span className={labelCls}>Work email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@yourgarage.com"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className={labelCls}>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : step === "credentials" ? (
            <form onSubmit={sendOtp} className="space-y-[18px]">
              <label className="block space-y-2">
                <span className={labelCls}>Phone number</span>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="024 123 4567"
                  className={`${inputCls} tracking-wide`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <span className="block text-[13px] text-muted-foreground">
                  We&apos;ll text you a 6-digit code. Ghana numbers only.
                </span>
              </label>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-[18px]">
              <p className="text-sm text-muted-foreground">
                Code sent to <span className="font-semibold text-foreground">{phone}</span>
              </p>
              <label className="block space-y-2">
                <span className={labelCls}>6-digit code</span>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className={`${inputCls} h-14 text-center font-mono text-2xl tracking-[0.5em]`}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <Button type="submit" size="lg" className="w-full" disabled={loading || otp.length !== 6}>
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
            <p className="rounded-xl border border-[#C6F432] bg-[#F4FCD9] px-4 py-3 text-sm font-medium text-[#3D5406]">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-[#FFC2CC] bg-[#FFF1F3] px-4 py-3 text-sm font-medium text-[#B3122F]">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-border-subtle pt-5 text-sm text-muted-foreground">
            {mode === "signup" ? (
              <span>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("password")} className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">
                  Sign in
                </button>
              </span>
            ) : (
              <span>
                New to FixAm?{" "}
                <button type="button" onClick={() => switchMode("signup")} className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">
                  Start a 14-day free trial
                </button>
              </span>
            )}
            <span>
              Driver looking for your car?{" "}
              <Link href="/portal" className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">
                Go to the customer portal
              </Link>
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 FixAm</p>
      </section>

      {/* Showcase side */}
      <aside className="relative hidden min-w-0 flex-[1_1_520px] flex-col justify-center gap-10 overflow-hidden bg-[#0B0F1A] p-14 text-[#F4F2EE] lg:flex">
        <div aria-hidden className="absolute -right-[200px] -top-[160px] h-[620px] w-[720px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.30)_0%,rgba(255,90,31,0)_100%)]" />
        <PhotoImg photo={photos.mechanicEngine} fill priority sizes="50vw" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.55)_0%,rgba(11,15,26,0.7)_40%,rgba(11,15,26,0.95)_100%)]" />
        <div aria-hidden className="absolute -right-[200px] -top-[160px] h-[620px] w-[720px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.25)_0%,rgba(255,90,31,0)_100%)]" />
        <div className="relative max-w-[520px]">
          <div className="text-[13px] font-semibold text-[#FF8A57]">Your workshop, at a glance</div>
          <h2 className="mt-3 font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">
            Seven cars in the bays. Two ready to collect.
          </h2>
        </div>
        <div className="relative flex max-w-[520px] flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] bg-[linear-gradient(135deg,#FF7A3D,#D4430F)] p-5 shadow-[0_16px_40px_-16px_rgba(212,67,15,0.7)]">
              <div className="text-xs text-white/85">Collected today</div>
              <div className="mt-2 font-display text-[32px] font-bold tabular-nums"><span className="mr-0.5 align-[9px] text-base">GH₵</span>4,860</div>
            </div>
            <div className="rounded-[18px] border border-white/10 bg-[#121A2E]/80 p-5 backdrop-blur-md">
              <div className="text-xs text-[#8A93AB]">Reminders → bookings</div>
              <div className="mt-2 font-display text-[32px] font-bold text-[#D9F76F]">31%</div>
            </div>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-[#121A2E]/80 p-2 backdrop-blur-md">
            {[
              { plate: "GN 4410-20", car: "Nissan Almera", label: "Ready", cls: "bg-[#C6F432] text-[#0B0F1A]" },
              { plate: "AS 5678-22", car: "Hyundai Elantra", label: "Awaiting approval", cls: "bg-[#FFB020]/15 text-[#FFC24D]" },
              { plate: "GR 1234-24", car: "Toyota Corolla", label: "In progress", cls: "bg-[#FF5A1F]/15 text-[#FF8A57]" },
            ].map((r, i) => (
              <div key={r.plate} className={cn("flex items-center justify-between rounded-xl p-3", i > 0 && "border-t border-white/[0.06]")}>
                <div className="flex items-center gap-3">
                  <span className="rounded-[5px] bg-[#F4F2EE] px-[7px] py-0.5 font-mono text-[11px] font-semibold text-[#16130F]">{r.plate}</span>
                  <span className="text-sm">{r.car}</span>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", r.cls)}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center justify-between gap-4">
          <p className="text-[13px] text-[#8A93AB]">Sample data shown.</p>
          <PhotoCredit photo={photos.mechanicEngine} />
        </div>
      </aside>
    </main>
  )
}
