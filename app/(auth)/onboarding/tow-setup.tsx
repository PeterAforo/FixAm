"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Crosshair, Rocket, Truck, Wallet } from "lucide-react"
import { Button } from "@/components/brand/button"
import { towSignup } from "@/lib/towing/actions"
import { SERVICES } from "@/lib/towing/core"
import { normalizeGhPhone } from "@/lib/phone"
import { photos } from "@/lib/images"
import { Field, FormError, OnboardingFrame, PreviewCard, onbInputCls } from "./onboarding-frame"
import { GH_REGIONS } from "./options"

const STEPS = [
  { label: "Your business", hint: "Name, phone and base" },
  { label: "Services & rates", hint: "What you do, fees and MoMo" },
]

/** P8-15: tow operator setup — creates the /tow workspace. */
export function TowSetup({ defaultPhone }: { defaultPhone: string | null }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState(defaultPhone ? `0${defaultPhone.replace(/^\+233/, "")}` : "")
  const [city, setCity] = useState("")
  const [region, setRegion] = useState("Greater Accra")
  const [base, setBase] = useState<{ lat: number; lng: number } | null>(null)
  const [radius, setRadius] = useState("25")
  const [services, setServices] = useState<string[]>(["flatbed"])
  const [baseFee, setBaseFee] = useState("150")
  const [perKm, setPerKm] = useState("10")
  const [momo, setMomo] = useState("")
  const [momoName, setMomoName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phoneOk = Boolean(normalizeGhPhone(phone))
  const momoPhone = normalizeGhPhone(momo || phone)
  const can0 = businessName.trim().length >= 2 && phoneOk

  function locate() {
    if (!navigator.geolocation) return setError("Location isn't available on this device")
    navigator.geolocation.getCurrentPosition(
      (p) => setBase({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError("Couldn't get your location — you can share it later from your dashboard"),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  async function submit() {
    setError(null)
    setBusy(true)
    const res = await towSignup({
      businessName, phone: normalizeGhPhone(phone) ?? phone, city, region,
      baseLat: base?.lat ?? null, baseLng: base?.lng ?? null,
      serviceRadiusKm: Number(radius) || 25, services,
      baseFeeGhs: Number(baseFee) || 0, perKmFeeGhs: Number(perKm) || 0,
      momoPhone: momoPhone ?? undefined,
      momoName: momoName.trim() || businessName.trim(),
    })
    if (!res.ok) { setBusy(false); return setError(res.error) }
    router.push("/tow")
    router.refresh()
  }

  return (
    <OnboardingFrame
      photo={photos.accraStreet}
      badge="For towing & roadside help"
      title="Breakdown calls, straight to your phone."
      intro="Drivers press SOS and the nearest available tow trucks get the job by SMS. First to accept gets it. You set the price; MoMo payments are held safely until the job is done."
      steps={STEPS}
      step={step}
      onStep={setStep}
      stepIcon={step === 0 ? Truck : Wallet}
      stepTitle={step === 0 ? "Tell us about your business" : "Services, rates and payouts"}
      stepSub={step === 0 ? "Drivers see your business name and phone when you accept their call." : "Your rates pre-fill each quote — you can change the price on every job."}
      exitHref="/onboarding"
      exitLabel="Back to roles"
      preview={
        <PreviewCard
          label="What drivers see"
          name={businessName.trim() || "Your towing business"}
          place={[city.trim(), `${radius} km radius`].filter(Boolean).join(" · ")}
          slug={baseFee ? `From GH₵ ${baseFee}${perKm ? ` + GH₵ ${perKm}/km` : ""}` : "Set your rates"}
        />
      }
      footer={
        step === 0 ? (
          <>
            <span className="text-[13px] text-muted-foreground">Free while we pilot.</span>
            <Button type="button" size="lg" onClick={() => setStep(1)} disabled={!can0}>Continue <ArrowRight className="size-4" /></Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}><ArrowLeft className="size-4" /> Back</Button>
            <Button type="button" size="lg" onClick={submit} loading={busy} disabled={!services.length}>
              {busy ? "Setting up…" : "Start getting jobs"} {!busy && <Rocket className="size-4" />}
            </Button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          <Field label="Business name">
            <input className={onbInputCls} autoFocus value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Kwame Towing Services" />
          </Field>
          <Field label="Phone" hint={phone && !phoneOk ? <span className="text-[#B3122F]">Enter a Ghana number</span> : "New SOS jobs are sent here by SMS."}>
            <input className={onbInputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City or town"><input className={onbInputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Accra" /></Field>
            <Field label="Region">
              <select className={onbInputCls} value={region} onChange={(e) => setRegion(e.target.value)}>{GH_REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
            </Field>
          </div>
          <Field label="Where your truck usually waits" hint="Used to send you nearby jobs when you aren't sharing live location.">
            <Button type="button" variant="secondary" onClick={locate}><Crosshair className="size-4" /> {base ? `Saved (${base.lat.toFixed(4)}, ${base.lng.toFixed(4)})` : "Use my current location"}</Button>
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">What do you offer?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SERVICES.map((s) => (
                <button key={s.id} type="button" onClick={() => setServices((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))}
                  className={`rounded-full border px-3 py-1.5 text-sm ${services.includes(s.id) ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Call-out fee (GH₵)"><input className={onbInputCls} inputMode="decimal" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} /></Field>
            <Field label="Per km (GH₵)"><input className={onbInputCls} inputMode="decimal" value={perKm} onChange={(e) => setPerKm(e.target.value)} /></Field>
            <Field label="How far you'll go (km)"><input className={onbInputCls} inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="MoMo number for payouts" hint="When drivers pay by MoMo, FixAm pays you here after the job.">
              <input className={onbInputCls} inputMode="tel" value={momo} onChange={(e) => setMomo(e.target.value)} placeholder={phone || "024 123 4567"} />
            </Field>
            <Field label="Name on the MoMo account"><input className={onbInputCls} value={momoName} onChange={(e) => setMomoName(e.target.value)} /></Field>
          </div>
        </div>
      )}
      <FormError message={error} />
    </OnboardingFrame>
  )
}
