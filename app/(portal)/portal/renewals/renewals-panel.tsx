"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck, CheckCircle2, MessageCircle, Phone, Plus, ShieldCheck, Star, X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { StatusPill } from "@/components/brand/status-pill"
import {
  createDriverBrokerRequest,
  driverRespondToQuote,
  listBrokersFor,
  type BrokerRequestView,
  type BrokerView,
} from "@/lib/brokers/actions"
import { REQUEST_STATUS, SERVICE_TYPES, type RequestKind } from "@/lib/brokers/catalog"
import { formatGHS } from "@/lib/money"
import { cn } from "@/lib/utils"

type Vehicle = { id: string; plate: string; make: string; model: string; year: number | null }
type MyRequest = BrokerRequestView & {
  brokerName: string
  brokerPhone: string
  brokerVerified: boolean
  events: { id: string; status: string; actor: string; note: string | null; createdAt: string }[]
}

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function DriverRenewalsPanel({
  startOpen,
  city,
  vehicles,
  requests,
}: {
  startOpen: boolean
  city: string
  vehicles: Vehicle[]
  requests: MyRequest[]
}) {
  const [open, setOpen] = useState(startOpen)
  const active = requests.filter((r) => ["requested", "quoted", "accepted", "in_progress"].includes(r.status))
  const past = requests.filter((r) => !active.includes(r))

  return (
    <div className="mx-auto max-w-[960px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-[-0.03em]">Insurance & DVLA renewals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Get quotes from licensed brokers and agents. Accept the one you like — they handle the rest.</p>
        </div>
        {!open && (
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New renewal
          </Button>
        )}
      </div>

      {open && <NewRequest city={city} vehicles={vehicles} onClose={requests.length ? () => setOpen(false) : undefined} />}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">In progress</h2>
          {active.map((r) => <RequestCard key={r.id} r={r} />)}
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-muted-foreground">Past renewals</h2>
          {past.map((r) => <RequestCard key={r.id} r={r} />)}
        </section>
      )}
    </div>
  )
}

function NewRequest({ city, vehicles, onClose }: { city: string; vehicles: Vehicle[]; onClose?: () => void }) {
  const router = useRouter()
  const [kind, setKind] = useState<RequestKind>("insurance")
  const [serviceType, setServiceType] = useState(SERVICE_TYPES.insurance[0]!.value)
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "manual")
  const [plate, setPlate] = useState("")
  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [expiry, setExpiry] = useState("")
  const [notes, setNotes] = useState("")
  const [brokers, setBrokers] = useState<BrokerView[] | null>(null)
  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true
    listBrokersFor({ kind, city: city || undefined }).then((list) => {
      if (!alive) return
      setBrokers(list)
      setBrokerId(list[0]?.id ?? null)
    })
    return () => { alive = false }
  }, [kind, city])

  const v = vehicles.find((x) => x.id === vehicleId)
  const finalPlate = v ? v.plate : plate

  function submit() {
    if (!brokerId) return
    setError(null)
    start(async () => {
      const res = await createDriverBrokerRequest({
        brokerId,
        kind,
        serviceType,
        vehiclePlate: finalPlate,
        vehicleMake: v?.make ?? make,
        vehicleModel: v?.model ?? model,
        vehicleYear: v?.year ?? null,
        currentExpiry: expiry,
        notes,
      })
      if (!res.ok) return setError(res.error.message)
      onClose?.()
      router.replace("/portal/renewals")
      router.refresh()
    })
  }

  return (
    <section className="rounded-[22px] border border-border bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Request a quote</h2>
          <p className="mt-1 text-sm text-muted-foreground">The broker gets an SMS and replies with a price. Nothing is charged until you accept.</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full hover:bg-surface-muted">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 rounded-xl bg-surface-muted p-1">
            {(["insurance", "dvla"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  if (k === kind) return
                  setBrokers(null)
                  setBrokerId(null)
                  setKind(k)
                  setServiceType(SERVICE_TYPES[k][0]!.value)
                }}
                className={cn("h-9 rounded-[9px] text-sm transition-colors", kind === k ? "bg-card font-semibold shadow-1" : "font-medium text-muted-foreground")}
              >
                {k === "insurance" ? "Motor insurance" : "DVLA"}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What do you need?</span>
            <select className={inputCls} value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              {SERVICE_TYPES[kind].map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Vehicle</span>
            <select className={inputCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((x) => <option key={x.id} value={x.id}>{[x.plate, x.make, x.model].filter(Boolean).join(" · ")}</option>)}
              <option value="manual">Another vehicle…</option>
            </select>
          </label>
          {vehicleId === "manual" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <input className={`${inputCls} font-mono uppercase`} placeholder="Plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
              <input className={inputCls} placeholder="Make" value={make} onChange={(e) => setMake(e.target.value)} />
              <input className={inputCls} placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Current expiry (optional)</span>
              <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Note (optional)</span>
              <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. car used for Uber" />
            </label>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Choose who handles it</p>
          <div className="mt-2 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {brokers === null && [0, 1, 2].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-muted" />)}
            {brokers?.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
                No {kind === "dvla" ? "DVLA agents" : "insurance brokers"} have joined yet. Ask your garage — many handle renewals themselves.
              </p>
            )}
            {brokers?.map((b) => {
              const on = brokerId === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBrokerId(b.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all",
                    on ? "border-foreground shadow-[0_0_0_4px_rgba(255,90,31,0.12)]" : "border-border hover:border-border-strong"
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EFE9FF] font-display font-bold text-[#5B3CC4]">
                    {b.businessName[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{b.businessName}</span>
                      {b.isVerified && <BadgeCheck className="size-4 shrink-0 text-[#4E6B07]" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[b.city, b.defaultServiceFee != null ? `fee from ${formatGHS(b.defaultServiceFee)}` : null, b.insurers.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {b.ratingAvg != null && (
                    <span className="flex items-center gap-0.5 text-xs font-semibold"><Star className="size-3.5 fill-[#FFB020] text-[#FFB020]" />{b.ratingAvg.toFixed(1)}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 text-sm font-medium text-[#B3122F]">{error}</p>}
      <div className="mt-5 flex justify-end border-t border-border pt-4">
        <Button type="button" loading={pending} disabled={!brokerId || finalPlate.trim().length < 3} onClick={submit}>
          <ShieldCheck className="size-4" /> Send request
        </Button>
      </div>
    </section>
  )
}

function RequestCard({ r }: { r: MyRequest }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const st = REQUEST_STATUS[r.status]

  function respond(action: "accept" | "cancel") {
    setError(null)
    start(async () => {
      const res = await driverRespondToQuote({ requestId: r.id, action })
      if (!res.ok) return setError(res.error.message)
      router.refresh()
    })
  }

  return (
    <article className="rounded-[20px] border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border-[1.5px] border-foreground bg-white px-2 py-0.5 font-mono text-xs font-semibold text-[#16130F]">{r.vehiclePlate}</span>
            <StatusPill tone={st?.tone ?? "neutral"} size="sm">{st?.label ?? r.status}</StatusPill>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold">{r.serviceLabel} · {r.brokerName}</h3>
          <p className="text-xs text-muted-foreground">{r.number} · {new Date(r.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
        {r.total != null && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Quote</p>
            <p className="font-display text-xl font-bold tabular-nums">{formatGHS(r.total)}</p>
            {r.serviceFee != null && r.officialFee != null && (
              <p className="text-[11px] text-muted-foreground">{formatGHS(r.officialFee)} + {formatGHS(r.serviceFee)} fee</p>
            )}
          </div>
        )}
      </div>

      {r.status === "quoted" && (
        <div className="mt-4 rounded-2xl bg-surface-muted p-4">
          {r.insurerName && <p className="text-sm"><span className="text-muted-foreground">Insurer:</span> <span className="font-medium">{r.insurerName}</span></p>}
          {r.quoteNote && <p className="mt-1 whitespace-pre-line text-sm">{r.quoteNote}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" loading={pending} onClick={() => respond("accept")}>
              <CheckCircle2 className="size-4" /> Accept quote
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => respond("cancel")}>Decline</Button>
          </div>
        </div>
      )}
      {r.status === "accepted" && (
        <p className="mt-4 rounded-2xl bg-[#EEF8D6] px-4 py-3 text-sm text-[#3D5406] dark:bg-[#C6F432]/10 dark:text-[#D9F76F]">
          You accepted this quote. {r.brokerName} will contact you to collect payment and any documents.
        </p>
      )}
      {r.status === "completed" && (
        <p className="mt-4 rounded-2xl bg-[#EEF8D6] px-4 py-3 text-sm text-[#3D5406] dark:bg-[#C6F432]/10 dark:text-[#D9F76F]">
          Done!{r.completionRef ? ` Reference ${r.completionRef}.` : ""}{r.newExpiry ? ` Valid until ${new Date(r.newExpiry).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}.` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <a href={`tel:${r.brokerPhone}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:bg-surface-muted">
          <Phone className="size-4" /> Call broker
        </a>
        <a
          href={`https://wa.me/${r.brokerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello, about my renewal ${r.number} for ${r.vehiclePlate}.`)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:bg-surface-muted"
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
        {r.status === "requested" && (
          <button type="button" disabled={pending} onClick={() => respond("cancel")} className="ml-auto text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel request
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-[#B3122F]">{error}</p>}
    </article>
  )
}
