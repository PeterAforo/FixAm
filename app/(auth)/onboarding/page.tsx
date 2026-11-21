"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createGarage } from "@/lib/onboarding/actions"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/brand/card"
import { Stepper } from "@/components/brand/stepper"
import { Wrench, Plus, Trash2 } from "lucide-react"
import { normalizeGhPhone } from "@/lib/phone"
import { parseGHS } from "@/lib/money"

const STAFF_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "service_advisor", label: "Service advisor" },
  { value: "mechanic", label: "Mechanic" },
  { value: "storekeeper", label: "Storekeeper" },
  { value: "accountant", label: "Accountant" },
] as const

type Invite = { phone: string; role: string }

const inputCls =
  "min-h-12 w-full rounded-lg border-2 border-border bg-surface px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelCls = "block space-y-1.5"
const labelText = "text-sm font-bold"

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

  const steps = ["Garage", "Branch & rates", "Team", "Done"]

  const slugPreview = useMemo(
    () => slug || (garageName ? slugify(garageName) : "your-garage"),
    [slug, garageName]
  )

  function next() {
    setError(null)
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }

  function back() {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
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
      bays: bays.filter(Boolean),
      invites: invites.map((i) => ({ phone: i.phone, role: i.role as never })),
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-14 items-center justify-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-chunky-sm">
            <Wrench className="size-7" />
          </span>
          <CardTitle className="text-3xl">Set up your garage</CardTitle>
          <CardDescription>Takes about 3 minutes. You&apos;re on a free Pro trial.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Stepper
            steps={steps.map((label, i) => ({
              label,
              state: i < step ? "done" : i === step ? "current" : "upcoming",
            }))}
          />

          {step === 0 && (
            <div className="space-y-4">
              <label className={labelCls}>
                <span className={labelText}>Garage name</span>
                <input
                  className={inputCls}
                  value={garageName}
                  onChange={(e) => {
                    setGarageName(e.target.value)
                    if (!slugTouched) setSlug("")
                  }}
                  placeholder="Pitstop Motors"
                />
              </label>
              <label className={labelCls}>
                <span className={labelText}>Garage link</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">fixam.app/g/</span>
                  <input
                    className={`${inputCls} font-mono`}
                    value={slugPreview}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setSlug(slugify(e.target.value))
                    }}
                  />
                </div>
              </label>
              <label className={labelCls}>
                <span className={labelText}>Phone</span>
                <input
                  className={`${inputCls} font-mono`}
                  inputMode="tel"
                  placeholder="0241234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className={labelCls}>
                <span className={labelText}>Email (optional)</span>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  <span className={labelText}>Address</span>
                  <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
                </label>
                <label className={labelCls}>
                  <span className={labelText}>City</span>
                  <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Accra" />
                </label>
              </div>
              <div className="rounded-xl border-2 border-border bg-surface-muted/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={labelText}>Garage location</p>
                    <p className="text-xs text-muted-foreground">
                      {gps
                        ? `📍 ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} — is this your garage's location? Customers use it to find you.`
                        : "Add your GPS location so customers can find your garage on the map."}
                    </p>
                    {gpsError && <p className="mt-1 text-xs font-semibold text-danger">{gpsError}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={gpsLoading}
                    onClick={() => {
                      if (!navigator.geolocation) {
                        setGpsError("Location is not supported on this device — enter the address instead.")
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
                          setGpsError("Could not get your location — check browser permissions.")
                          setGpsLoading(false)
                        },
                        { enableHighAccuracy: true, timeout: 10000 }
                      )
                    }}
                  >
                    {gpsLoading ? "Locating…" : gps ? "Update location" : "Use current location"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  <span className={labelText}>Branch name</span>
                  <input className={inputCls} value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                </label>
                <label className={labelCls}>
                  <span className={labelText}>Branch code</span>
                  <input
                    className={`${inputCls} font-mono uppercase`}
                    maxLength={5}
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  />
                </label>
              </div>
              <div className="space-y-2">
                <span className={labelText}>Bays / workstations</span>
                {bays.map((b, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputCls}
                      value={b}
                      onChange={(e) =>
                        setBays((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      placeholder={`Bay ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-12 min-w-12 px-3"
                      onClick={() => setBays((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove bay"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBays((prev) => [...prev, `Bay ${prev.length + 1}`])}
                >
                  <Plus className="size-4" /> Add bay
                </Button>
              </div>
              <label className={labelCls}>
                <span className={labelText}>Default labour rate (GHS/hour)</span>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={labourRate}
                  onChange={(e) => setLabourRate(e.target.value)}
                  placeholder="150.00"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  <span className={labelText}>VAT %</span>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={vatPercent}
                    onChange={(e) => setVatPercent(e.target.value)}
                  />
                </label>
                <label className="flex items-end gap-3 pb-2">
                  <input
                    type="checkbox"
                    id="tax-inclusive"
                    checked={pricesIncludeTax}
                    onChange={(e) => setPricesIncludeTax(e.target.checked)}
                    className="size-5 accent-primary"
                  />
                  <span className="text-sm font-bold">Prices include VAT</span>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Invite your team by phone number. They&apos;ll get an SMS (mock inbox in dev) and
                join when they sign in.
              </p>
              {invites.map((inv, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={`${inputCls} font-mono`}
                    inputMode="tel"
                    placeholder="0241234567"
                    value={inv.phone}
                    onChange={(e) =>
                      setInvites((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x))
                      )
                    }
                  />
                  <select
                    className={`${inputCls} max-w-44`}
                    value={inv.role}
                    onChange={(e) =>
                      setInvites((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x))
                      )
                    }
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12 min-w-12 px-3"
                    onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove invite"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setInvites((prev) => [...prev, { phone: "", role: "mechanic" }])}
              >
                <Plus className="size-4" /> Add staff
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg border-2 border-border bg-muted p-4">
                <strong>{garageName || "Your garage"}</strong> · fixam.app/g/{slugPreview}
                <br />
                {branchName} · {bays.filter(Boolean).length} bay{bays.filter(Boolean).length === 1 ? "" : "s"} ·{" "}
                {invites.length} invite{invites.length === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground">
                After this you can add customers, vehicles and jobs — or import seed data.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border-2 border-danger bg-danger/10 px-4 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={back} disabled={submitting}>
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button
                type="button"
                className="flex-1"
                onClick={next}
                disabled={
                  (step === 0 && (!garageName.trim() || !normalizeGhPhone(phone))) ||
                  (step === 1 && !branchName.trim())
                }
              >
                Continue
              </Button>
            ) : (
              <Button type="button" className="flex-1" onClick={submit} disabled={submitting}>
                {submitting ? "Creating…" : "Create garage"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
