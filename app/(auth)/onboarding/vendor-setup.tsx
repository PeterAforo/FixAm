"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Rocket, Store, Truck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { vendorSignup } from "@/lib/vendors/actions"
import { normalizeGhPhone } from "@/lib/phone"
import { photos } from "@/lib/images"
import { Field, FormError, OnboardingFrame, PreviewCard, onbInputCls } from "./onboarding-frame"
import { PlanPicker, type PlanOption } from "./plan-picker"
import { Chips, Segmented } from "./chips"
import { GH_REGIONS, PART_CATEGORIES } from "./options"

const STEPS = [
  { label: "Your shop", hint: "Name, contact and what you sell" },
  { label: "Delivery & payouts", hint: "Where you deliver, how you get paid" },
]

export function VendorSetup({ defaultPhone, defaultEmail, plans }: { defaultPhone: string | null; defaultEmail: string; plans: PlanOption[] }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState(defaultPhone ? `0${defaultPhone.replace(/^\+233/, "")}` : "")
  const [email, setEmail] = useState(defaultEmail)
  const [city, setCity] = useState("")
  const [region, setRegion] = useState("Greater Accra")
  const [categories, setCategories] = useState<string[]>([])

  const [zones, setZones] = useState<string[]>(["Greater Accra"])
  const [fee, setFee] = useState("30")
  const [eta, setEta] = useState("24")
  const [payoutMethod, setPayoutMethod] = useState<"momo" | "bank">("momo")
  const [payoutDetails, setPayoutDetails] = useState("")
  const [planCode, setPlanCode] = useState(() => plans[Math.min(1, plans.length - 1)]?.code ?? plans[0]?.code ?? "")

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phoneOk = Boolean(normalizeGhPhone(phone))
  const can0 = businessName.trim().length >= 2 && phoneOk && categories.length > 0

  async function submit() {
    setError(null)
    setBusy(true)
    const res = await vendorSignup({
      businessName,
      phone: normalizeGhPhone(phone) ?? phone,
      email,
      city,
      region,
      categories,
      deliveryZones: zones.map((r) => ({ region: r, fee: Number(fee) || 0, etaHours: Number(eta) || undefined })),
      payoutMethod,
      payoutDetails: payoutDetails || undefined,
      planCode: planCode || undefined,
    })
    if (!res.ok) {
      setBusy(false)
      return setError(res.error.message)
    }
    router.push("/vendor")
    router.refresh()
  }

  return (
    <OnboardingFrame
      photo={photos.oilChange}
      badge="Sell to garages & drivers"
      title="Put your parts in front of every garage near you."
      intro="Garages order straight from their job cards. Drivers order for their own cars. You deliver and get paid."
      steps={STEPS}
      step={step}
      onStep={setStep}
      stepIcon={step === 0 ? Store : Truck}
      stepTitle={step === 0 ? "Tell us about your shop" : "Delivery and payouts"}
      stepSub={step === 0 ? "This is how garages will find you in the marketplace." : "You can change these any time in your shop settings."}
      exitHref="/onboarding"
      exitLabel="Back to roles"
      preview={
        <PreviewCard
          label="Your marketplace listing"
          name={businessName.trim() || "Your shop"}
          place={[city.trim() || "Your city", categories[0]].filter(Boolean).join(" · ")}
          slug={categories.length ? categories.slice(0, 3).join(" · ") : "Engine parts · Brakes · Oils"}
        />
      }
      footer={
        step === 0 ? (
          <>
            <span className="text-[13px] text-muted-foreground">Listings go live after a quick check.</span>
            <Button type="button" size="lg" onClick={() => setStep(1)} disabled={!can0}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button type="button" size="lg" onClick={submit} loading={busy} disabled={zones.length === 0}>
              {busy ? "Opening your shop…" : "Open my shop"} {!busy && <Rocket className="size-4" />}
            </Button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          <Field label="Shop name">
            <input className={onbInputCls} autoFocus value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Abossey Okai Auto Spares" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" hint={phone && !phoneOk ? <span className="text-[#B3122F]">Enter a Ghana number</span> : undefined}>
              <input className={onbInputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" />
            </Field>
            <Field label="E-mail (optional)">
              <input className={onbInputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@yourshop.com" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City or town">
              <input className={onbInputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Accra" />
            </Field>
            <Field label="Region">
              <select className={onbInputCls} value={region} onChange={(e) => setRegion(e.target.value)}>
                {GH_REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <p className="text-sm font-medium">What do you sell?</p>
            <p className="mb-2.5 text-xs text-muted-foreground">Pick up to 6.</p>
            <Chips options={PART_CATEGORIES} value={categories} onChange={setCategories} max={6} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium">Regions you deliver to</p>
            <p className="mb-2.5 text-xs text-muted-foreground">Garages outside these regions won&apos;t see a delivery option.</p>
            <Chips options={GH_REGIONS} value={zones} onChange={setZones} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Standard delivery fee">
              <span className="flex h-11 overflow-hidden rounded-xl border border-input bg-card focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                <span className="flex items-center border-r border-input bg-background px-3.5 text-sm font-medium">GH₵</span>
                <input className="min-w-0 flex-1 bg-transparent px-3.5 tabular-nums outline-none" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
              </span>
            </Field>
            <Field label="Usual delivery time">
              <span className="flex h-11 overflow-hidden rounded-xl border border-input bg-card focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
                <input className="min-w-0 flex-1 bg-transparent px-3.5 tabular-nums outline-none" inputMode="numeric" value={eta} onChange={(e) => setEta(e.target.value.replace(/\D/g, ""))} />
                <span className="flex items-center border-l border-input bg-background px-3.5 text-sm font-medium">hours</span>
              </span>
            </Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">How should we pay you?</p>
            <Segmented
              options={[{ value: "momo", label: "Mobile Money" }, { value: "bank", label: "Bank account" }]}
              value={payoutMethod}
              onChange={setPayoutMethod}
            />
            <input
              className={onbInputCls}
              value={payoutDetails}
              onChange={(e) => setPayoutDetails(e.target.value)}
              placeholder={payoutMethod === "momo" ? "MoMo number and name, e.g. 024 123 4567 · Kofi Mensah" : "Bank, branch, account name and number"}
            />
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">Choose your plan</p>
            <p className="mb-2.5 text-xs text-muted-foreground">14 days free — you choose what you pay after the trial.</p>
            <PlanPicker plans={plans} value={planCode} onChange={setPlanCode} />
          </div>
        </div>
      )}
      <FormError message={error} />
    </OnboardingFrame>
  )
}
