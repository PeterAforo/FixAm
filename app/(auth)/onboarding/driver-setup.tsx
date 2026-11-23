"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Car, UserRound } from "lucide-react"
import { Button } from "@/components/brand/button"
import { PhoneVerify } from "@/components/auth/phone-verify"
import { addPortalVehicle, completePortalRegistration } from "@/lib/portal/profile-actions"
import { photos } from "@/lib/images"
import { Field, FormError, OnboardingFrame, onbInputCls } from "./onboarding-frame"

const STEPS = [
  { label: "About you", hint: "Name and phone" },
  { label: "Your car", hint: "Plate, make and model" },
]

export function DriverSetup({ phone: initialPhone, defaultName, defaultEmail }: { phone: string | null; defaultName: string; defaultEmail: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [phone, setPhone] = useState(initialPhone)
  const [fullName, setFullName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [city, setCity] = useState("")
  const [marketing, setMarketing] = useState(false)
  const [terms, setTerms] = useState(false)

  const [plate, setPlate] = useState("")
  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [year, setYear] = useState("")
  const [color, setColor] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveProfile() {
    setError(null)
    setBusy(true)
    const res = await completePortalRegistration({ fullName, email, city, marketingOptIn: marketing, acceptTerms: true })
    setBusy(false)
    if (!res.ok) return setError(res.error.message)
    setStep(1)
  }

  async function saveCar() {
    setError(null)
    setBusy(true)
    const res = await addPortalVehicle({
      plateNumber: plate,
      make,
      model,
      year: year ? Number(year) : null,
      color,
    })
    if (!res.ok) {
      setBusy(false)
      return setError(res.error.message)
    }
    router.push("/portal")
    router.refresh()
  }

  const canProfile = Boolean(phone) && fullName.trim().length >= 2 && terms
  const canCar = make.trim().length > 0 && model.trim().length > 0

  return (
    <OnboardingFrame
      photo={photos.suvGarage}
      badge="Free for drivers"
      title="Your car's whole life, in your pocket."
      intro="Live repair updates, one-tap approvals and reminders before oil, insurance or roadworthy run out."
      steps={STEPS}
      step={step}
      onStep={setStep}
      stepIcon={step === 0 ? UserRound : Car}
      stepTitle={step === 0 ? "Tell us about you" : "Add your car"}
      stepSub={step === 0 ? "Garages that already know you will link up automatically by phone." : "You can add more cars later."}
      exitHref="/onboarding"
      exitLabel="Back to roles"
      preview={
        <>
          <p className="text-xs font-medium text-[#9AA3BA]">Your garage card</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 font-mono text-xs font-semibold text-[#16130F]">{plate.toUpperCase() || "GR 1234-24"}</span>
            <span className="text-xs text-[#9AA3BA]">{fullName.trim() || "You"}</span>
          </div>
          <p className="mt-3 text-[15px] font-semibold">{[make, model].filter(Boolean).join(" ") || "Your car"}{year ? ` · ${year}` : ""}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            {["Oil", "Insurance", "Roadworthy"].map((l) => (
              <span key={l} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-center text-[#C9CFDD]">{l}<br /><span className="font-semibold text-[#C6F432]">Tracked</span></span>
            ))}
          </div>
        </>
      }
      footer={
        step === 0 ? (
          <>
            <span className="text-[13px] text-muted-foreground">Takes under a minute.</span>
            <Button type="button" size="lg" onClick={saveProfile} disabled={!canProfile} loading={busy}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => { router.push("/portal"); router.refresh() }}>Skip for now</Button>
              <Button type="button" size="lg" onClick={saveCar} disabled={!canCar} loading={busy}>
                Finish <ArrowRight className="size-4" />
              </Button>
            </div>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          {!phone ? (
            <PhoneVerify onVerified={setPhone} />
          ) : (
            <p className="rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm">
              Phone <span className="font-semibold">{phone.replace("+233", "0")}</span> <span className="text-muted-foreground">· verified</span>
            </p>
          )}
          <Field label="Full name">
            <input className={onbInputCls} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Abena Owusu" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City or town">
              <input className={onbInputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Accra" />
            </Field>
            <Field label="E-mail (optional)">
              <input className={onbInputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-5 accent-[#16130F]" />
            <span className="text-sm">Send me occasional offers from garages I use</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-5 accent-[#16130F]" />
            <span className="text-sm">I agree to the <a href="/terms" target="_blank" className="underline">Terms</a> and <a href="/privacy" target="_blank" className="underline">Privacy Policy</a></span>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Number plate" hint="As shown on the car, e.g. GR 1234-24">
            <input className={`${onbInputCls} font-mono uppercase`} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="GR 1234-24" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Make">
              <input className={onbInputCls} value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
            </Field>
            <Field label="Model">
              <input className={onbInputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Corolla" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Year (optional)">
              <input className={onbInputCls} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} placeholder="2016" />
            </Field>
            <Field label="Colour (optional)">
              <input className={onbInputCls} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Silver" />
            </Field>
          </div>
        </div>
      )}
      <FormError message={error} />
    </OnboardingFrame>
  )
}
