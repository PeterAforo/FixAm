"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Plus,
  Rocket,
  Store,
  Users,
  Warehouse,
  X,
} from "lucide-react"
import { createGarage } from "@/lib/onboarding/actions"
import { Button } from "@/components/brand/button"
import { Logo } from "@/components/marketing/logo"
import { normalizeGhPhone } from "@/lib/phone"
import { parseGHS } from "@/lib/money"
import { cn } from "@/lib/utils"

const STAFF_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "service_advisor", label: "Service advisor" },
  { value: "mechanic", label: "Mechanic" },
  { value: "storekeeper", label: "Storekeeper" },
  { value: "accountant", label: "Accountant" },
] as const

type Invite = { phone: string; role: string }

const STEPS = [
  { label: "Your garage", hint: "Name, contact and location", icon: Store, title: "Tell us about your garage", sub: "This is how customers will find and recognise you." },
  { label: "Branch & rates", hint: "Bays, labour rate and VAT", icon: Warehouse, title: "Set up your workshop", sub: "Add your first branch, the bays you work in and how you charge." },
  { label: "Your team", hint: "Invite staff by phone", icon: Users, title: "Invite your team", sub: "They'll get an SMS invite and join when they sign in. You can skip this for now." },
  { label: "Launch", hint: "Review and go live", icon: Rocket, title: "Ready to launch", sub: "Check everything looks right. You can change any of this later in Settings." },
] as const

const inputCls =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [garageName, setGarageName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  const [branchName, setBranchName] = useState("Main branch")
  const [branchCode, setBranchCode] = useState("MAIN")
  const [bays, setBays] = useState<string[]>(["Bay 1"])
  const [labourRate, setLabourRate] = useState("150.00")
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false)
  const [vatPercent, setVatPercent] = useState("15")

  const [invites, setInvites] = useState<Invite[]>([])

  const slugPreview = useMemo(
    () => slug || (garageName ? slugify(garageName) : "your-garage"),
    [slug, garageName]
  )
  const phoneValid = Boolean(normalizeGhPhone(phone))
  const cleanBays = bays.map((b) => b.trim()).filter(Boolean)
  const validInvites = invites.filter((i) => normalizeGhPhone(i.phone))

  const canContinue =
    step === 0 ? Boolean(garageName.trim()) && phoneValid : step === 1 ? Boolean(branchName.trim()) : true

  function go(to: number) {
    setError(null)
    setStep(Math.max(0, Math.min(to, STEPS.length - 1)))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function locate() {
    if (!navigator.geolocation) {
      setGpsError("Location isn't supported on this device — the address is enough.")
      return
    }
    setGpsLoading(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsLoading(false)
      },
      () => {
        setGpsError("We couldn't get your location. Check your browser permissions, or skip this.")
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    const result = await createGarage({
      garageName,
      slug: slugPreview,
      phone,
      email,
      address,
      city,
      gpsLat: gps?.lat ?? null,
      gpsLng: gps?.lng ?? null,
      branchName,
      branchCode,
      defaultLabourRate: Number(parseGHS(labourRate || "0")),
      pricesIncludeTax,
      vatPercent: Number(vatPercent) || 0,
      bays: cleanBays,
      invites: validInvites.map((i) => ({ phone: i.phone, role: i.role as never })),
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error.message)
      const fe = result.error.fieldErrors
      if (fe) {
        const first = Object.values(fe).flat()[0]
        if (first) setError(first)
      }
      return
    }
    router.push(`/g/${result.data.slug}`)
    router.refresh()
  }

  const current = STEPS[step]!

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      {/* Left rail — progress + live preview */}
      <aside className="relative hidden w-[420px] shrink-0 flex-col overflow-hidden bg-[#0B0F1A] p-10 text-[#F4F2EE] lg:flex">
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 size-[560px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.26)_0%,rgba(255,90,31,0)_100%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <Logo className="relative" />
        <div className="relative mt-12">
          <p className="text-[13px] font-semibold text-[#FF8A57]">14-day free Pro trial</p>
          <h1 className="mt-2 font-display text-[32px] font-bold leading-[1.08] tracking-[-0.03em]">Let&apos;s get your garage running on FixAm.</h1>
          <p className="mt-3 text-[15px] text-[#AEB5C8]">About three minutes. No card needed.</p>
        </div>

        <ol className="relative mt-10 space-y-1">
          {STEPS.map((s, i) => {
            const done = i < step
            const active = i === step
            return (
              <li key={s.label}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => go(i)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors",
                    active ? "bg-white/[0.07]" : "hover:bg-white/[0.04] disabled:hover:bg-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      done && "bg-[#C6F432] text-[#0B0F1A]",
                      active && "bg-[#D4430F] text-white shadow-[0_0_0_4px_rgba(212,67,15,0.25)]",
                      !done && !active && "border border-white/15 text-[#8A93AB]"
                    )}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span>
                    <span className={cn("block text-[15px] font-semibold", !done && !active && "text-[#8A93AB]")}>{s.label}</span>
                    <span className="block text-[13px] text-[#8A93AB]">{s.hint}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* Live preview */}
        <div className="relative mt-auto rounded-[20px] border border-white/10 bg-[#121A2E] p-5">
          <p className="text-xs font-medium text-[#8A93AB]">Your public garage page</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,#FF7A3D,#D4430F)] font-display text-lg font-bold text-white">
              {(garageName.trim()[0] ?? "G").toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{garageName.trim() || "Your garage"}</p>
              <p className="flex items-center gap-1 truncate text-[13px] text-[#8A93AB]">
                <MapPin className="size-3.5" /> {city.trim() || "Your city"}
              </p>
            </div>
          </div>
          <p className="mt-3 truncate rounded-lg bg-white/5 px-2.5 py-1.5 font-mono text-xs text-[#AEB5C8]">fixam.app/g/{slugPreview}</p>
        </div>
      </aside>

      {/* Form column */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-5 md:px-12">
          <Logo className="lg:invisible" />
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Save and exit</Link>
        </div>

        {/* Mobile progress */}
        <div className="px-6 md:px-12 lg:hidden">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <span key={s.label} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-[#D4430F]" : "bg-border")} />
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[600px] flex-1 px-6 pb-12 pt-8 md:px-0 md:pt-14">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-subtle text-primary"><current.icon className="size-5" /></span>
            <p className="text-sm font-medium text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          </div>
          <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.08] tracking-[-0.03em]">{current.title}</h2>
          <p className="mt-2 text-base text-muted-foreground">{current.sub}</p>

          <div className="mt-10">
            {step === 0 && (
              <div className="space-y-6">
                <Field label="Garage name">
                  <input
                    className={inputCls}
                    value={garageName}
                    autoFocus
                    onChange={(e) => {
                      setGarageName(e.target.value)
                      if (!slugTouched) setSlug("")
                    }}
                    placeholder="e.g. Pitstop Motors"
                  />
                </Field>
                <Field label="Garage link" hint="Customers use this link to book and find you.">
                  <span className="flex h-12 overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                    <span className="flex items-center border-r border-input bg-background px-3.5 text-sm text-muted-foreground">fixam.app/g/</span>
                    <input
                      className="min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[15px] outline-none"
                      value={slugPreview}
                      onChange={(e) => {
                        setSlugTouched(true)
                        setSlug(slugify(e.target.value))
                      }}
                    />
                  </span>
                </Field>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field
                    label="Phone"
                    hint={phone && !phoneValid ? <span className="text-[#B3122F]">Enter a Ghana number, e.g. 024 123 4567</span> : undefined}
                  >
                    <input className={inputCls} inputMode="tel" autoComplete="tel" placeholder="024 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                  <Field label="Email (optional)">
                    <input className={inputCls} type="email" autoComplete="email" placeholder="hello@yourgarage.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-6 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <Field label="Street address">
                    <input className={inputCls} autoComplete="street-address" placeholder="e.g. Spintex Road, near Shell" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Field>
                  <Field label="City or town">
                    <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Accra" />
                  </Field>
                </div>

                <div className={cn("flex flex-wrap items-center gap-4 rounded-[18px] border p-5", gps ? "border-[#C6F432] bg-[#F8FDE6]" : "border-border bg-card")}>
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", gps ? "bg-[#C6F432] text-[#0B0F1A]" : "bg-surface-muted text-muted-foreground")}>
                    {gps ? <Check className="size-5" strokeWidth={2.6} /> : <MapPin className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{gps ? "Location saved" : "Pin your garage on the map"}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {gps
                        ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} — make sure you're at the garage when you set this.`
                        : "Optional, but it puts you on the map and gives drivers directions."}
                    </p>
                    {gpsError && <p className="mt-1 text-[13px] font-medium text-[#B3122F]">{gpsError}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={locate}
                    disabled={gpsLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-card px-4 text-sm font-medium transition-colors hover:bg-surface-sunken disabled:opacity-60"
                  >
                    {gpsLoading ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
                    {gpsLoading ? "Locating…" : gps ? "Update" : "Use my location"}
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-8">
                <div className="grid gap-6 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <Field label="Branch name">
                    <input className={inputCls} value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                  </Field>
                  <Field label="Branch code" hint="Used on invoice numbers">
                    <input className={`${inputCls} font-mono uppercase`} maxLength={5} value={branchCode} onChange={(e) => setBranchCode(e.target.value.toUpperCase())} />
                  </Field>
                </div>

                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Bays and workstations</p>
                      <p className="text-[13px] text-muted-foreground">Each bay becomes a lane on your job board.</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{cleanBays.length} bay{cleanBays.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {bays.map((b, i) => (
                      <div key={i} className="flex h-12 items-center rounded-xl border border-input bg-card pl-3.5 pr-1.5 transition-shadow focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                        <Building2 className="size-4 shrink-0 text-muted-foreground" />
                        <input
                          className="min-w-0 flex-1 bg-transparent px-2.5 text-[15px] outline-none"
                          value={b}
                          aria-label={`Bay ${i + 1} name`}
                          onChange={(e) => setBays((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={`Bay ${i + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setBays((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Remove ${b || `bay ${i + 1}`}`}
                          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setBays((prev) => [...prev, `Bay ${prev.length + 1}`])}
                      className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-sm font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <Plus className="size-4" /> Add bay
                    </button>
                  </div>
                </div>

                <div className="rounded-[18px] border border-border bg-card p-5">
                  <p className="text-[15px] font-semibold">Pricing</p>
                  <div className="mt-4 grid gap-6 sm:grid-cols-2">
                    <Field label="Labour rate per hour">
                      <span className="flex h-12 overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                        <span className="flex items-center border-r border-input bg-background px-3.5 text-sm font-medium">GH₵</span>
                        <input className="min-w-0 flex-1 bg-transparent px-3.5 text-[15px] tabular-nums outline-none" inputMode="decimal" value={labourRate} onChange={(e) => setLabourRate(e.target.value)} placeholder="150.00" />
                      </span>
                    </Field>
                    <Field label="VAT rate">
                      <span className="flex h-12 overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                        <input className="min-w-0 flex-1 bg-transparent px-3.5 text-[15px] tabular-nums outline-none" inputMode="decimal" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} />
                        <span className="flex items-center border-l border-input bg-background px-3.5 text-sm font-medium">%</span>
                      </span>
                    </Field>
                  </div>
                  <label className="mt-5 flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={pricesIncludeTax} onChange={(e) => setPricesIncludeTax(e.target.checked)} className="mt-0.5 size-5 accent-[#16130F]" />
                    <span>
                      <span className="block text-sm font-medium">My prices already include VAT</span>
                      <span className="block text-[13px] text-muted-foreground">Leave unticked if VAT should be added on top of your prices.</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {invites.length === 0 && (
                  <div className="flex flex-col items-center rounded-[18px] border border-dashed border-border-strong bg-card/60 px-6 py-10 text-center">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground"><Users className="size-6" /></span>
                    <p className="mt-3 text-[15px] font-semibold">No one invited yet</p>
                    <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">Add mechanics, service advisors or your accountant. Each person only sees what their role needs.</p>
                  </div>
                )}
                {invites.map((inv, i) => (
                  <div key={i} className="flex flex-wrap gap-2 rounded-[18px] border border-border bg-card p-3 sm:flex-nowrap">
                    <input
                      className={`${inputCls} flex-1`}
                      inputMode="tel"
                      aria-label={`Team member ${i + 1} phone`}
                      placeholder="024 123 4567"
                      value={inv.phone}
                      onChange={(e) => setInvites((prev) => prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
                    />
                    <select
                      className={`${inputCls} sm:max-w-48`}
                      aria-label={`Team member ${i + 1} role`}
                      value={inv.role}
                      onChange={(e) => setInvites((prev) => prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                    >
                      {STAFF_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove invite"
                      className="flex size-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setInvites((prev) => [...prev, { phone: "", role: "mechanic" }])}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-sm font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  <Plus className="size-4" /> Add a team member
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="overflow-hidden rounded-[20px] border border-border bg-card">
                {[
                  {
                    title: "Garage",
                    to: 0,
                    rows: [
                      ["Name", garageName.trim() || "—"],
                      ["Link", `fixam.app/g/${slugPreview}`],
                      ["Phone", phone || "—"],
                      ["Location", [address, city].filter(Boolean).join(", ") || "—"],
                      ["Map pin", gps ? "Saved" : "Not set"],
                    ],
                  },
                  {
                    title: "Workshop",
                    to: 1,
                    rows: [
                      ["Branch", `${branchName} (${branchCode})`],
                      ["Bays", cleanBays.length ? cleanBays.join(", ") : "—"],
                      ["Labour rate", `GH₵ ${labourRate || "0"} / hour`],
                      ["VAT", `${vatPercent || 0}% ${pricesIncludeTax ? "included in prices" : "added on top"}`],
                    ],
                  },
                  {
                    title: "Team",
                    to: 2,
                    rows: [["Invites", validInvites.length ? `${validInvites.length} person${validInvites.length === 1 ? "" : "s"} will get an SMS` : "Just you for now"]],
                  },
                ].map((sec, si) => (
                  <div key={sec.title} className={cn("p-6", si > 0 && "border-t border-border")}>
                    <div className="flex items-center justify-between">
                      <p className="text-[15px] font-semibold">{sec.title}</p>
                      <button type="button" onClick={() => go(sec.to)} className="text-sm font-medium text-[#B8390A] hover:text-[#8F2C08]">Edit</button>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm">
                      {sec.rows.map(([k, v]) => (
                        <div key={k} className="flex gap-4">
                          <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                          <dd className="min-w-0 break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-6 rounded-xl border border-[#FFC2CC] bg-[#FFF1F3] px-4 py-3 text-sm font-medium text-[#B3122F]">
              {error}
            </p>
          )}

          <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => go(step - 1)} disabled={submitting}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            ) : (
              <span className="text-[13px] text-muted-foreground">You can change all of this later.</span>
            )}
            <div className="flex items-center gap-2">
              {step === 2 && invites.length === 0 && (
                <Button type="button" variant="ghost" onClick={() => go(3)}>Skip for now</Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" size="lg" onClick={() => go(step + 1)} disabled={!canContinue}>
                  Continue <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button type="button" size="lg" onClick={submit} loading={submitting}>
                  {submitting ? "Creating your garage…" : "Create my garage"}
                  {!submitting && <Rocket className="size-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
