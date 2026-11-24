"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Bike, Camera, FileCheck, Rocket, Wallet } from "lucide-react"
import { Button } from "@/components/brand/button"
import { riderSignup } from "@/lib/riders/actions"
import { photos } from "@/lib/images"
import { Field, FormError, OnboardingFrame, PreviewCard, onbInputCls } from "./onboarding-frame"
import { PlanPicker, type PlanOption } from "./plan-picker"

const STEPS = [
  { label: "You & your bike", hint: "Ghana Card, plate, photos" },
  { label: "Payouts", hint: "MoMo number" },
]

function PhotoPick({ label, hint, file, onPick, icon }: { label: string; hint?: string; file: File | null; onPick: (f: File | null) => void; icon: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-3 text-left hover:border-foreground/40">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPick(e.target.files?.[0] ?? null); e.target.value = "" }} />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{file ? file.name : hint ?? "Tap to add a photo"}</span>
      </span>
    </button>
  )
}

/** P8-18: FixAm rider setup — creates the /rider workspace (admin approves before jobs). */
export function RiderSetup({ defaultPhone, defaultName, plans }: { defaultPhone: string | null; defaultName: string | null; plans: PlanOption[] }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [ghanaCard, setGhanaCard] = useState("")
  const [bikePlate, setBikePlate] = useState("")
  const [motorbike, setMotorbike] = useState<File | null>(null)
  const [licence, setLicence] = useState<File | null>(null)
  const [momo, setMomo] = useState(defaultPhone ? `0${defaultPhone.replace(/^\+233/, "")}` : "")
  const [momoName, setMomoName] = useState(defaultName ?? "")
  const [planCode, setPlanCode] = useState(() => plans[Math.min(1, plans.length - 1)]?.code ?? plans[0]?.code ?? "")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cardOk = /^\d{10}$/.test(ghanaCard.replace(/[^\d]/g, ""))
  const can0 = cardOk && bikePlate.trim().length >= 2 && !!motorbike && !!licence

  async function submit() {
    setError(null)
    setBusy(true)
    const form = new FormData()
    form.set("ghanaCard", ghanaCard)
    form.set("bikePlate", bikePlate)
    form.set("momoPhone", momo)
    form.set("momoName", momoName)
    if (planCode) form.set("planCode", planCode)
    if (motorbike) form.set("motorbike", motorbike)
    if (licence) form.set("licence", licence)
    const res = await riderSignup(form)
    if (!res.ok) { setBusy(false); return setError(res.error) }
    router.push("/rider")
    router.refresh()
  }

  return (
    <OnboardingFrame
      photo={photos.accraStreet}
      badge="For FixAm riders"
      title="Deliveries near you, paid to your MoMo."
      intro="Go online when you're free — nearby jobs come to your phone. Pickup and drop-off PINs keep every handover safe. Earnings pay out after each confirmed delivery. FixAm verifies every rider before they can take jobs."
      steps={STEPS}
      step={step}
      onStep={setStep}
      stepIcon={step === 0 ? Bike : Wallet}
      stepTitle={step === 0 ? "Tell us about you and your bike" : "Where should we pay you?"}
      stepSub={step === 0 ? "Your Ghana Card is encrypted and checked by our team — we never show the full number." : "Each confirmed delivery pays straight to this MoMo after the handover."}
      exitHref="/onboarding"
      exitLabel="Back to roles"
      preview={
        <PreviewCard
          label="What senders see"
          name={defaultName?.trim() || "You"}
          place={bikePlate.trim() ? `Bike ${bikePlate.trim()}` : "Your motorbike"}
          slug="Verified FixAm rider"
        />
      }
      footer={
        step === 0 ? (
          <>
            <span className="text-[13px] text-muted-foreground">14-day free trial.</span>
            <Button type="button" size="lg" onClick={() => setStep(1)} disabled={!can0}>Continue <ArrowRight className="size-4" /></Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}><ArrowLeft className="size-4" /> Back</Button>
            <Button type="button" size="lg" onClick={submit} loading={busy} disabled={!momo.trim() || !momoName.trim()}>
              {busy ? "Setting up…" : "Join the rider network"} {!busy && <Rocket className="size-4" />}
            </Button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          <Field label="Ghana Card number" hint="Format GHA-XXXXXXXXX-X. Encrypted; our team verifies it before you get jobs.">
            <input className={onbInputCls} inputMode="numeric" autoFocus value={ghanaCard} onChange={(e) => setGhanaCard(e.target.value)} placeholder="GHA-123456789-0" />
          </Field>
          <Field label="Motorbike plate">
            <input className={onbInputCls} value={bikePlate} onChange={(e) => setBikePlate(e.target.value)} placeholder="e.g. GW 1234-24" />
          </Field>
          <PhotoPick label="Photo of your motorbike" icon={<Bike className="size-5" />} file={motorbike} onPick={setMotorbike} />
          <PhotoPick label="Photo of your licence" hint="Driver's licence or learner's permit" icon={<Camera className="size-5" />} file={licence} onPick={setLicence} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="MoMo number for payouts" hint="MTN, Telecel or AirtelTigo.">
              <input className={onbInputCls} inputMode="tel" value={momo} onChange={(e) => setMomo(e.target.value)} placeholder={defaultPhone ? `0${defaultPhone.replace(/^\+233/, "")}` : "024 123 4567"} />
            </Field>
            <Field label="Name on the MoMo account">
              <input className={onbInputCls} value={momoName} onChange={(e) => setMomoName(e.target.value)} placeholder={defaultName ?? "Your name"} />
            </Field>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted/50 p-4 text-sm text-muted-foreground">
            <FileCheck className="mt-0.5 size-4 shrink-0" />
            <p>A FixAm admin reviews every rider — usually within a day. You&rsquo;ll get an SMS when you&rsquo;re cleared to go online.</p>
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
