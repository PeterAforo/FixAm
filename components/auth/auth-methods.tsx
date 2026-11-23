"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/auth/supabase/client"
import { afterSignIn, requestSignInCode, verifySignInCode } from "@/lib/auth/phone-auth"
import { Button } from "@/components/brand/button"
import { OtpBoxes, PhoneField, authInputCls, toGhInput, useCountdown } from "./phone-code"
import { cn } from "@/lib/utils"

type Method = "phone" | "email"

/**
 * Phone-code (primary) + e-mail (fallback) authentication.
 * `signin` on /login, `signup` on /signup/[role]. `next` is where a
 * successful sign-up should go (e.g. /onboarding/garage); sign-in uses the
 * remembered destination cookie instead.
 */
export function AuthMethods({ mode, next }: { mode: "signin" | "signup"; next?: string }) {
  const router = useRouter()
  const supabase = createClient()
  const signup = mode === "signup"

  const [method, setMethod] = useState<Method>("phone")
  const [phone, setPhone] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [devCode, setDevCode] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const left = useCountdown(resendAt)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function go(dest: string) {
    router.push(dest)
    router.refresh()
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setLoading(true)
    const res = await requestSignInCode({ phone: toGhInput(phone) })
    setLoading(false)
    if (!res.ok) return setError(res.error.message)
    setSentTo(res.data.phone)
    setDevCode(res.data.devCode ?? null)
    setCode("")
    setResendAt(Date.now() + 30_000)
  }

  async function verify(value = code) {
    if (!sentTo || value.length !== 6 || loading) return
    setError(null)
    setLoading(true)
    const res = await verifySignInCode({ phone: sentTo, code: value, next: next ?? null })
    if (!res.ok) {
      setLoading(false)
      setCode("")
      return setError(res.error.message)
    }
    go(res.data.destination)
  }

  async function emailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (email.trim().toLowerCase().endsWith("@phone.fixam.app")) {
      return setError("Use the Phone number tab to sign in with your phone.")
    }
    setLoading(true)
    if (!signup) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setLoading(false)
        return setError(error.message === "Invalid login credentials" ? "That e-mail and password don't match." : error.message)
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      if (error) {
        setLoading(false)
        return setError(error.message)
      }
      if (!data.session) {
        setLoading(false)
        return setNotice("Check your inbox to confirm your e-mail, then sign in to continue setting up.")
      }
    }
    const res = await afterSignIn(next ?? null)
    if (!res.ok) {
      setLoading(false)
      return setError(res.error.message)
    }
    go(res.data.destination)
  }

  return (
    <div className="flex flex-col gap-5">
      {sentTo ? (
        <div>
          <button
            type="button"
            onClick={() => { setSentTo(null); setError(null) }}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Change number
          </button>
          <p className="text-[15px] text-muted-foreground">
            Enter the 6-digit code we texted to <span className="font-semibold text-foreground">{sentTo.replace("+233", "0")}</span>.
          </p>
        </div>
      ) : (
        <div role="tablist" aria-label="Method" className="grid grid-cols-2 rounded-xl bg-[#F4F0EA] p-1 dark:bg-white/5">
          {(["phone", "email"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => { setMethod(m); setError(null); setNotice(null) }}
              className={cn(
                "h-10 rounded-[9px] text-sm transition-colors",
                method === m ? "bg-card font-semibold text-foreground shadow-1" : "font-medium text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "phone" ? "Phone number" : "E-mail"}
            </button>
          ))}
        </div>
      )}

      {method === "phone" && !sentTo && (
        <form onSubmit={sendCode} className="space-y-4">
          <label className="block space-y-2" htmlFor="phone">
            <span className="text-sm font-medium">{signup ? "Your mobile number" : "Phone number"}</span>
            <PhoneField value={phone} onChange={setPhone} autoFocus />
            <span className="block text-[13px] text-muted-foreground">
              {signup ? "We'll text a code to verify it's you. This becomes your sign-in." : "We'll text you a code — no password needed."}
            </span>
          </label>
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={phone.replace(/\D/g, "").length < 9}>
            {signup ? "Send verification code" : "Send sign-in code"}
          </Button>
        </form>
      )}

      {method === "phone" && sentTo && (
        <div className="space-y-4">
          <OtpBoxes value={code} onChange={setCode} onComplete={verify} disabled={loading} />
          {devCode && (
            <p className="rounded-xl border border-dashed border-border-strong bg-background px-4 py-2.5 text-[13px] text-muted-foreground">
              Development mode — SMS isn&apos;t connected. Your code is <span className="font-mono font-semibold text-foreground">{devCode}</span>
            </p>
          )}
          <Button type="button" size="lg" className="w-full" loading={loading} disabled={code.length !== 6} onClick={() => verify()}>
            {signup ? "Verify and continue" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn&apos;t get it?{" "}
            {left > 0 ? (
              <span>Resend in {left}s</span>
            ) : (
              <button type="button" onClick={() => sendCode()} className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">
                Send a new code
              </button>
            )}
          </p>
        </div>
      )}

      {method === "email" && !sentTo && (
        <form onSubmit={emailSubmit} className="space-y-4">
          {signup && (
            <label className="block space-y-2">
              <span className="text-sm font-medium">Full name</span>
              <input className={authInputCls} required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          )}
          <label className="block space-y-2">
            <span className="text-sm font-medium">E-mail</span>
            <input className={authInputCls} type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Password</span>
            <input
              className={authInputCls}
              type="password"
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "At least 8 characters" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {signup ? "Create account" : "Sign in"}
          </Button>
        </form>
      )}

      {notice && <p className="rounded-xl border border-[#C6F432] bg-[#F4FCD9] px-4 py-3 text-sm font-medium text-[#3D5406]">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-[#FFC2CC] bg-[#FFF1F3] px-4 py-3 text-sm font-medium text-[#B3122F]">{error}</p>}

      {!sentTo && (
        <p className="text-center text-sm text-muted-foreground">
          {signup ? "Already have an account? " : "New to FixAm? "}
          <Link href={signup ? "/login" : "/signup"} className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      )}
    </div>
  )
}
