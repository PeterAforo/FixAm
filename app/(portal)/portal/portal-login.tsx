"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Logo } from "@/components/marketing/logo"
import { cn } from "@/lib/utils"
import { requestPortalOtp, verifyPortalOtp, portalPasswordLogin } from "@/lib/portal/actions"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"
import { photos } from "@/lib/images"

const inputCls =
  "h-[52px] w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

/** Accepts "24 123 4567", "024…", "233…" or "+233…" and returns a form normalizeGhPhone understands. */
function toLocalPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("233") || digits.startsWith("0")) return digits
  return digits ? `0${digits}` : ""
}

function prettyPhone(raw: string): string {
  const local = toLocalPhone(raw)
  const nine = local.startsWith("233") ? local.slice(3) : local.replace(/^0/, "")
  return nine.length === 9 ? `+233 ${nine.slice(0, 2)} ${nine.slice(2, 5)} ${nine.slice(5)}` : raw
}

function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "")

  function setAt(i: number, d: string) {
    const next = digits.slice()
    next[i] = d
    onChange(next.join("").slice(0, 6))
  }

  return (
    <div className="grid grid-cols-6 gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          aria-label={`Digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "")
            if (v.length > 1) {
              onChange(v.slice(0, 6))
              refs.current[Math.min(v.length, 5)]?.focus()
              return
            }
            setAt(i, v)
            if (v && i < 5) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus()
          }}
          onPaste={(e) => {
            const v = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
            if (v) {
              e.preventDefault()
              onChange(v)
              refs.current[Math.min(v.length, 5)]?.focus()
            }
          }}
          className={cn(
            "h-[60px] rounded-xl border bg-card text-center font-mono text-2xl font-semibold text-foreground outline-none transition-shadow focus:border-[#E8470F] focus:ring-4 focus:ring-[#FF5A1F]/15",
            d ? "border-foreground" : "border-input"
          )}
        />
      ))}
    </div>
  )
}

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
      const res = await requestPortalOtp({ phone: toLocalPhone(phone) })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      setCode("")
      setStep("code")
    })
  }

  function verify(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await verifyPortalOtp({ phone: toLocalPhone(phone), code })
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
    <main className="flex min-h-dvh flex-wrap bg-card text-foreground">
      {/* Visual side */}
      <aside className="relative hidden min-w-0 flex-[1_1_520px] flex-col justify-between gap-10 overflow-hidden bg-[#F6EFE6] p-12 lg:flex">
        <div aria-hidden className="absolute left-1/2 top-1/2 size-[760px] -translate-x-1/2 -translate-y-[45%] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,122,61,0.30)_0%,rgba(255,122,61,0)_100%)]" />
        <Logo className="relative" suffix="for drivers" />

        <div className="relative flex justify-center">
          <div className="flex w-[340px] flex-col gap-[18px] rounded-[28px] bg-white p-6 shadow-[0_40px_80px_-30px_rgba(122,52,20,0.35),0_0_0_1px_rgba(22,19,15,0.05)]">
            <div className="flex items-center justify-between">
              <span className="rounded-md border-[1.5px] border-foreground bg-white px-2 py-0.5 font-mono text-xs font-semibold">GR 1234-24</span>
              <span className="text-xs text-muted-foreground">Pitstop Motors</span>
            </div>
            <div className="relative h-[150px] overflow-hidden rounded-[18px]">
              <PhotoImg photo={photos.suvGarage} fill sizes="300px" />
              <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(11,15,26,0.6)_100%)]" />
              <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur">
                <span className="size-1.5 rounded-full bg-[#4E6B07]" /> In for service · Bay 2
              </span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[17px] font-semibold">Toyota Corolla</div>
                <div className="text-[13px] text-muted-foreground">2016 · ≈ 52 km/day</div>
              </div>
              <div className="text-right">
                <div className="font-display text-[30px] font-bold leading-none">86</div>
                <div className="text-[11px] text-muted-foreground">care score</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[13px]">
              <div className="flex flex-col gap-1 rounded-[14px] border border-border p-2.5"><span className="text-[11px] text-muted-foreground">Oil</span><span className="font-semibold text-[#4E6B07]">Good · Jan</span></div>
              <div className="flex flex-col gap-1 rounded-[14px] border border-[#F3D9A4] bg-[#FFF7E6] p-2.5"><span className="text-[11px] text-[#6B5320]">Insurance</span><span className="font-semibold text-[#7A5400]">17 days</span></div>
              <div className="flex flex-col gap-1 rounded-[14px] border border-border p-2.5"><span className="text-[11px] text-muted-foreground">Roadworthy</span><span className="font-semibold text-[#4E6B07]">Good · Dec</span></div>
            </div>
            <span className="rounded-full bg-foreground py-3 text-center text-sm font-semibold text-white">Renew insurance with Pitstop</span>
          </div>
        </div>

        <div className="relative max-w-[440px]">
          <h2 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.025em]">
            Every car you own, every service it&apos;s had, and what&apos;s due next.
          </h2>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Sample vehicle shown. <PhotoCredit photo={photos.suvGarage} className="text-muted-foreground/70 hover:text-foreground" />
          </p>
        </div>
      </aside>

      {/* Form side */}
      <section className="flex min-w-0 flex-[1_1_520px] flex-col px-6 py-8 md:p-12">
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <Logo className="text-foreground lg:invisible" />
          <span>
            Run a garage?{" "}
            <Link href="/login" className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">Garage sign in</Link>
          </span>
        </div>

        <div className="mx-auto my-auto flex w-full max-w-[400px] flex-col gap-7 py-10">
          {tab === "otp" && step === "phone" && (
            <form onSubmit={sendOtp} className="flex flex-col gap-7">
              <div>
                <h1 className="font-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">Your cars, one tap away</h1>
                <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
                  Sign in with the phone number your garage has on file. New here? We&apos;ll create your account after you verify.
                </p>
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Phone number</span>
                <span className="flex h-[52px] overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                  <span className="flex items-center border-r border-input bg-background px-3.5 text-[15px] font-medium">GH +233</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent px-3.5 text-[17px] tracking-wide outline-none placeholder:text-[#8C857B]"
                    placeholder="24 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel-national"
                    required
                  />
                </span>
              </label>
              <Button type="submit" size="lg" className="w-full" loading={pending}>Send me a code</Button>
              <p className="text-sm text-muted-foreground">
                Prefer a password?{" "}
                <button type="button" onClick={() => { setTab("password"); setMsg(null) }} className="font-semibold text-[#B8390A] hover:text-[#8F2C08]">
                  Sign in with username
                </button>
              </p>
            </form>
          )}

          {tab === "otp" && step === "code" && (
            <form onSubmit={verify} className="flex flex-col gap-7">
              <div>
                <button type="button" onClick={() => { setStep("phone"); setMsg(null) }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-4" /> Change number
                </button>
                <h1 className="mt-3.5 font-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">Enter your code</h1>
                <p className="mt-2.5 text-base text-muted-foreground">
                  We sent a 6-digit code by SMS to <strong className="text-foreground">{prettyPhone(phone)}</strong>.
                </p>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Verification code</legend>
                <OtpBoxes value={code} onChange={setCode} />
              </fieldset>
              <Button type="submit" size="lg" variant="secondary" className="w-full border-foreground bg-foreground text-white hover:bg-[#2A2724]" loading={pending} disabled={code.length !== 6}>
                Verify and continue
              </Button>
              <p className="text-sm text-muted-foreground">
                Didn&apos;t get it?{" "}
                <button type="button" onClick={sendOtp} disabled={pending} className="font-semibold text-[#B8390A] hover:text-[#8F2C08] disabled:opacity-50">
                  Send a new code
                </button>
              </p>
            </form>
          )}

          {tab === "password" && (
            <form onSubmit={passwordLogin} className="flex flex-col gap-[18px]">
              <div className="mb-2.5">
                <button type="button" onClick={() => { setTab("otp"); setMsg(null) }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-4" /> Use a phone code instead
                </button>
                <h1 className="mt-3.5 font-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">Sign in</h1>
                <p className="mt-2.5 text-base text-muted-foreground">Use your username or phone number and password.</p>
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Username or phone</span>
                <input className={inputCls} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Password</span>
                <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </label>
              <Button type="submit" size="lg" className="mt-2 w-full" loading={pending}>Sign in</Button>
            </form>
          )}

          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium",
                msg.ok ? "border-[#C6F432] bg-[#F4FCD9] text-[#3D5406]" : "border-[#FFC2CC] bg-[#FFF1F3] text-[#B3122F]"
              )}
            >
              {msg.text}
            </p>
          )}

          <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-background p-4">
            <ShieldCheck className="mt-px size-5 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-normal text-muted-foreground">
              Your garage only sees its own visits. You control your reminders and can turn messages off any time.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">© 2026 FixAm</p>
      </section>
    </main>
  )
}
