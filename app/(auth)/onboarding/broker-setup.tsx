"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Rocket } from "lucide-react"
import { Button } from "@/components/brand/button"
import { brokerSignup } from "@/lib/brokers/actions"
import { INSURERS } from "@/lib/brokers/catalog"
import { normalizeGhPhone } from "@/lib/phone"
import { photos } from "@/lib/images"
import { Field, FormError, OnboardingFrame, PreviewCard, onbInputCls } from "./onboarding-frame"
import { Chips, Segmented } from "./chips"
import { GH_REGIONS } from "./options"

type Kind = "insurance" | "dvla" | "both"

const STEPS = [
  { label: "Your business", hint: "Name, contact and location" },
  { label: "Services & fees", hint: "Licences, insurers and your fee" },
]

export function BrokerSetup({ defaultKind, defaultPhone, defaultEmail }: { defaultKind: Kind; defaultPhone: string | null; defaultEmail: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<Kind>(defaultKind)
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState(defaultPhone ? `0${defaultPhone.replace(/^\+233/, "")}` : "")
  const [email, setEmail] = useState(defaultEmail)
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [region, setRegion] = useState("Greater Accra")

  const [nic, setNic] = useState("")
  const [dvlaNo, setDvlaNo] = useState("")
  const [insurers, setInsurers] = useState<string[]>([])
  const [fee, setFee] = useState(kind === "dvla" ? "50" : "80")
  const [about, setAbout] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phoneOk = Boolean(normalizeGhPhone(phone))
  const can0 = businessName.trim().length >= 2 && phoneOk
  const doesInsurance = kind !== "dvla"
  const doesDvla = kind !== "insurance"

  async function submit() {
    setError(null)
    setBusy(true)
    const res = await brokerSignup({
      businessName,
      kind,
      phone: normalizeGhPhone(phone) ?? phone,
      email,
      address,
      city,
      region,
      about,
      nicLicenceNumber: doesInsurance ? nic : "",
      dvlaAgentNumber: doesDvla ? dvlaNo : "",
      insurers: doesInsurance ? insurers : [],
      defaultServiceFee: fee ? Number(fee) : null,
    })
    if (!res.ok) {
      setBusy(false)
      return setError(res.error.message)
    }
    router.push("/broker")
    router.refresh()
  }

  const title = kind === "dvla" ? "Turn DVLA queues into a steady pipeline." : "Motor renewals, delivered to your inbox."

  return (
    <OnboardingFrame
      photo={photos.accraCity}
      badge={kind === "dvla" ? "For DVLA agents" : kind === "both" ? "For brokers & agents" : "For insurance brokers"}
      title={title}
      intro="Garages hand you renewals they don't process themselves, and drivers request quotes straight from their phones. You quote, process and get paid."
      steps={STEPS}
      step={step}
      onStep={setStep}
      stepIcon={step === 0 ? Briefcase : BadgeCheck}
      stepTitle={step === 0 ? "Tell us about your business" : "Your services and fees"}
      stepSub={step === 0 ? "Drivers and garages see this when choosing who handles their renewal." : "Licence numbers earn you a Verified badge after our check."}
      exitHref="/onboarding"
      exitLabel="Back to roles"
      preview={
        <PreviewCard
          label="Your broker listing"
          name={businessName.trim() || "Your business"}
          place={[kind === "dvla" ? "DVLA agent" : kind === "both" ? "Insurance & DVLA" : "Insurance broker", city.trim()].filter(Boolean).join(" · ")}
          slug={fee ? `Service fee from GH₵ ${fee}` : "Set your service fee"}
        />
      }
      footer={
        step === 0 ? (
          <>
            <span className="text-[13px] text-muted-foreground">Free while we pilot.</span>
            <Button type="button" size="lg" onClick={() => setStep(1)} disabled={!can0}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button type="button" size="lg" onClick={submit} loading={busy}>
              {busy ? "Setting up…" : "Open my inbox"} {!busy && <Rocket className="size-4" />}
            </Button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">What do you handle?</p>
            <Segmented
              options={[{ value: "insurance", label: "Insurance" }, { value: "dvla", label: "DVLA" }, { value: "both", label: "Both" }]}
              value={kind}
              onChange={setKind}
            />
          </div>
          <Field label="Business name">
            <input className={onbInputCls} autoFocus value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={kind === "dvla" ? "e.g. Swift DVLA Services" : "e.g. Shield Insurance Brokers"} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" hint={phone && !phoneOk ? <span className="text-[#B3122F]">Enter a Ghana number</span> : "New requests are sent here by SMS."}>
              <input className={onbInputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" />
            </Field>
            <Field label="E-mail (optional)">
              <input className={onbInputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@yourbusiness.com" />
            </Field>
          </div>
          <Field label="Office address (optional)">
            <input className={onbInputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Ring Road Central, opposite DVLA" />
          </Field>
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
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {doesInsurance && (
              <Field label="NIC licence number" hint="National Insurance Commission">
                <input className={onbInputCls} value={nic} onChange={(e) => setNic(e.target.value)} placeholder="e.g. NIC/BRK/0123" />
              </Field>
            )}
            {doesDvla && (
              <Field label="DVLA agent number (optional)">
                <input className={onbInputCls} value={dvlaNo} onChange={(e) => setDvlaNo(e.target.value)} />
              </Field>
            )}
          </div>
          {doesInsurance && (
            <div>
              <p className="text-sm font-medium">Insurers you place with</p>
              <p className="mb-2.5 text-xs text-muted-foreground">Shown to drivers when they compare brokers.</p>
              <Chips options={INSURERS} value={insurers} onChange={setInsurers} />
            </div>
          )}
          <Field label="Your usual service fee" hint="Suggested on every quote — you can change it each time.">
            <span className="flex h-11 overflow-hidden rounded-xl border border-input bg-card focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
              <span className="flex items-center border-r border-input bg-background px-3.5 text-sm font-medium">GH₵</span>
              <input className="min-w-0 flex-1 bg-transparent px-3.5 tabular-nums outline-none" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </span>
          </Field>
          <Field label="About you (optional)">
            <textarea className={`${onbInputCls} h-20 resize-none py-2.5`} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Years in business, turnaround time, anything that builds trust." />
          </Field>
        </div>
      )}
      <FormError message={error} />
    </OnboardingFrame>
  )
}
