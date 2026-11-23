"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { ObdScanner } from "@/components/obd/obd-scanner"
import { CHECKLIST, INSPECTION_SECTIONS } from "@/lib/inspections/core"
import {
  completeInspectionAction,
  saveInspectionItemAction,
  startInspectionAction,
  uploadInspectionPhotoAction,
} from "@/lib/inspections/actions"
import { formatGHS } from "@/lib/money"

type Item = { itemKey: string; section: string; label: string; result: string; note: string | null; photoPath: string | null }
type Obd = { id: string; vin: string | null; milOn: boolean | null; codes: string[]; summary: string | null; createdAt: string }

const RESULTS = [
  { v: "pass", label: "Pass", cls: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white data-[on=true]:border-emerald-600" },
  { v: "attention", label: "Attention", cls: "data-[on=true]:bg-amber-500 data-[on=true]:text-white data-[on=true]:border-amber-500" },
  { v: "fail", label: "Fail", cls: "data-[on=true]:bg-red-600 data-[on=true]:text-white data-[on=true]:border-red-600" },
  { v: "na", label: "N/A", cls: "data-[on=true]:bg-surface-muted data-[on=true]:border-foreground/40" },
] as const

export function InspectionRunner(props: {
  garageId: string
  inspectionId: string
  number: string
  status: string
  paymentStatus: string
  price: number
  driverPhone: string
  car: string
  plate: string | null
  vin: string | null
  mileageKm: number | null
  locationKind: string
  seller: { name: string | null; phone: string | null; address: string | null }
  scheduledAt: string | null
  inspectorName: string | null
  testDriveNotes: string
  items: Item[]
  obd: Obd[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [testNotes, setTestNotes] = useState(props.testDriveNotes)
  const [openSection, setOpenSection] = useState<string>(CHECKLIST[0]?.section ?? "")
  const [local, setLocal] = useState<Record<string, Partial<Item>>>({})

  const byKey = useMemo(() => {
    const m = new Map<string, Item>()
    for (const i of props.items) m.set(i.itemKey, i)
    return m
  }, [props.items])

  const editable = ["booked", "in_progress"].includes(props.status)
  const labelFor = (key: string) => CHECKLIST.find((c) => c.key === key)?.label ?? key
  const itemFor = (key: string): Item => {
    const base = byKey.get(key)
    const patch = local[key]
    return { itemKey: key, section: key.split(".")[0]!, label: labelFor(key), result: "na", note: null, photoPath: null, ...(base ?? {}), ...(patch ?? {}) } as Item
  }

  function setResult(key: string, result: string) {
    setLocal((s) => ({ ...s, [key]: { ...s[key], itemKey: key, result } }))
    start(async () => {
      const r = await saveInspectionItemAction({ inspectionId: props.inspectionId, itemKey: key, result: result as "pass" | "attention" | "fail" | "na" })
      if (!r.ok) setMsg(r.error)
    })
  }

  function saveNote(key: string, note: string) {
    setLocal((s) => ({ ...s, [key]: { ...s[key], itemKey: key, note } }))
    start(async () => {
      const it = itemFor(key)
      await saveInspectionItemAction({ inspectionId: props.inspectionId, itemKey: key, result: it.result as "pass" | "attention" | "fail" | "na", note })
    })
  }

  function uploadPhoto(key: string, file: File) {
    const fd = new FormData()
    fd.set("inspectionId", props.inspectionId)
    fd.set("itemKey", key)
    fd.set("photo", file)
    start(async () => {
      const up = await uploadInspectionPhotoAction(fd)
      if (!up.ok) { setMsg(up.error); return }
      const it = itemFor(key)
      await saveInspectionItemAction({ inspectionId: props.inspectionId, itemKey: key, result: it.result as "pass" | "attention" | "fail" | "na", note: it.note ?? undefined, photoPath: up.path })
      setMsg("Photo attached.")
    })
  }

  function begin() {
    start(async () => {
      const r = await startInspectionAction({ garageId: props.garageId, inspectionId: props.inspectionId })
      if (!r.ok) {
        setMsg(r.error)
      } else {
        setMsg(null)
        router.refresh()
      }
    })
  }

  function finish() {
    start(async () => {
      const r = await completeInspectionAction({ inspectionId: props.inspectionId, testDriveNotes: testNotes })
      if (!r.ok) { setMsg(r.error); return }
      setShareUrl(r.shareUrl)
      setMsg(null)
      router.refresh()
    })
  }

  const counts = { pass: 0, attention: 0, fail: 0, na: 0 }
  for (const c of CHECKLIST) {
    const r = itemFor(c.key).result
    if (r === "pass") counts.pass++
    else if (r === "attention") counts.attention++
    else if (r === "fail") counts.fail++
    else counts.na++
  }

  return (
    <div className="mt-4 space-y-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{props.number} · {formatGHS(props.price)}</p>
              <h2 className="mt-1 font-display text-2xl font-bold">{props.car}{props.plate ? ` · ${props.plate}` : ""}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Driver {props.driverPhone} · {props.locationKind === "seller" ? "seller visit" : "at garage"}
                {props.scheduledAt ? ` · ${new Date(props.scheduledAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                {props.inspectorName ? ` · inspector ${props.inspectorName}` : ""}
              </p>
              {props.locationKind === "seller" && props.seller.name && (
                <p className="mt-1 text-sm">Seller: {props.seller.name} · {props.seller.phone} · {props.seller.address}</p>
              )}
              {(props.vin || props.mileageKm != null) && (
                <p className="mt-1 text-xs text-muted-foreground">{[props.vin && `VIN ${props.vin}`, props.mileageKm != null && `${props.mileageKm.toLocaleString()} km`].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold capitalize">{props.status.replace("_", " ")}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold">
            <span className="text-emerald-700">{counts.pass} pass</span>
            <span className="text-amber-700">{counts.attention} attention</span>
            <span className="text-red-700">{counts.fail} fail</span>
            <span className="text-muted-foreground">{counts.na} n/a</span>
          </div>
          {props.status === "booked" && props.paymentStatus === "paid" && (
            <Button className="mt-4" onClick={begin} loading={pending}>Start inspection</Button>
          )}
          {props.status === "awaiting_payment" && <p className="mt-4 text-sm text-amber-700">Waiting for the driver&apos;s payment to confirm.</p>}
        </CardContent>
      </Card>

      {shareUrl && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">Report complete — share this link with the buyer:</p>
          <a href={shareUrl} className="mt-1 block break-all font-mono text-primary underline">{shareUrl}</a>
          <p className="mt-1 text-xs text-emerald-800">It was also sent to the driver by SMS. The printable version is at <Link className="underline" href={`/print/inspection/${props.inspectionId}`}>/print/inspection</Link>.</p>
        </div>
      )}

      {msg && <p className="rounded-xl border border-border bg-surface-sunken px-4 py-3 text-sm">{msg}</p>}

      {editable && (
        <>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-display text-lg font-bold">OBD-II scan</h3>
              <p className="mt-1 text-sm text-muted-foreground">Plug in the Bluetooth adapter and scan — the result attaches to this inspection and feeds the AI report.</p>
              <div className="mt-3">
                <ObdScanner ctx={{ kind: "inspection", garageId: props.garageId, inspectionId: props.inspectionId }} />
              </div>
              {props.obd.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {props.obd.map((o) => (
                    <li key={o.id}>Scan {o.createdAt.slice(0, 10)}: {o.vin ? `VIN ${o.vin} · ` : ""}{o.codes.length ? o.codes.join(", ") : "no codes"}{o.milOn ? " · MIL on" : ""}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {INSPECTION_SECTIONS.map((s) => (
              <button key={s.key} type="button" onClick={() => setOpenSection(s.key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${openSection === s.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
                {s.label}
              </button>
            ))}
          </div>

          {INSPECTION_SECTIONS.filter((s) => s.key === openSection).map((s) => (
            <Card key={s.key}>
              <CardContent className="p-4">
                <h3 className="font-display text-base font-bold">{s.label}</h3>
                <ul className="mt-3 divide-y divide-border">
                  {s.items.map((label, idx) => {
                    const key = `${s.key}.${idx}`
                    const it = itemFor(key)
                    return (
                      <li key={key} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{labelFor(key)}</p>
                          <div className="flex gap-1">
                            {RESULTS.map((r) => (
                              <button key={r.v} type="button" data-on={it.result === r.v} disabled={pending}
                                onClick={() => setResult(key, r.v)}
                                className={`rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold ${r.cls}`}>
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            defaultValue={it.note ?? ""}
                            placeholder="Note (optional)"
                            className="min-h-9 min-w-48 flex-1 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:border-foreground"
                            onBlur={(e) => { if (e.target.value !== (it.note ?? "")) saveNote(key, e.target.value) }}
                          />
                          <label className="cursor-pointer text-xs font-semibold text-primary">
                            {it.photoPath ? "Photo ✓" : "Photo"}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(key, f); e.target.value = "" }} />
                          </label>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="space-y-3 p-5">
              <h3 className="font-display text-lg font-bold">Test drive notes</h3>
              <textarea value={testNotes} onChange={(e) => setTestNotes(e.target.value)} rows={4}
                placeholder="How did it drive? Pulls, noises, brake feel, high-speed behaviour…"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-foreground" />
              <Button onClick={finish} loading={pending}>Complete inspection &amp; generate report</Button>
              <p className="text-xs text-muted-foreground">The AI writes a plain-language summary and estimated repair costs (grounded in your garage&apos;s recent prices), then issues the shareable report link.</p>
            </CardContent>
          </Card>
        </>
      )}

      {props.status === "completed" && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            This inspection is complete. The shareable report link was sent to the driver by SMS when it was generated.
            Printable version: <Link className="font-semibold text-primary underline" href={`/print/inspection/${props.inspectionId}`}>open print view</Link>.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
