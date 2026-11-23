"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { Activity, Bluetooth, Eraser, Gauge, Plug, RefreshCw, Thermometer, Zap } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { PartOffersPanel } from "@/components/part-offers/part-offers-panel"
import { authorizeObdClear, confirmObdClear, saveObdScan, type SavedScan } from "@/lib/obd/actions"
import { addJobFinding } from "@/lib/jobs/actions"
import { clearCodes, fullScan, readLive, ObdError, type ObdTransport, type ScanResult } from "@/lib/obd/elm327"
import { bluetoothSupport, connectBleAdapter, type BluetoothSupport } from "@/lib/obd/web-bluetooth"
import type { LiveData } from "@/lib/obd/protocol"

type GarageCtx = { kind: "garage"; garageId: string; jobId: string; canClear: boolean; canAddFindings: boolean; canOrderParts: boolean }
type DriverCtx = { kind: "driver"; vehicleId: string }
/** P8-20: attach a scan to a pre-purchase inspection. */
type InspectionCtx = { kind: "inspection"; garageId: string; inspectionId: string }

const SEV: Record<string, { label: string; cls: string }> = {
  stop: { label: "Stop driving", cls: "bg-red-50 text-red-800 border-red-200" },
  soon: { label: "Fix soon", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  monitor: { label: "Can wait", cls: "bg-sky-50 text-sky-900 border-sky-200" },
}
const FINDING_SEV = { stop: "urgent", soon: "recommended", monitor: "can_wait" } as const

function Unsupported({ reason }: { reason: Exclude<BluetoothSupport, { ok: true }>["reason"] }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-sm">
      <p className="font-semibold">{reason === "ios" ? "Scanning works on Android for now" : "This browser can't use Bluetooth"}</p>
      <p className="mt-1 text-muted-foreground">
        {reason === "ios"
          ? "iPhones don't let websites use Bluetooth. Open FixAm in Chrome on an Android phone to read the car's fault codes. An iPhone app is planned."
          : reason === "insecure"
            ? "Bluetooth only works on the secure (https) FixAm site."
            : "Use Chrome on an Android phone (or Chrome/Edge on a computer) with Bluetooth turned on."}
      </p>
    </div>
  )
}

function LiveTiles({ live }: { live: LiveData }) {
  const tiles = [
    { icon: Gauge, label: "RPM", value: live.rpm != null ? live.rpm.toLocaleString() : "—" },
    { icon: Thermometer, label: "Coolant", value: live.coolantC != null ? `${live.coolantC}°C` : "—", warn: (live.coolantC ?? 0) >= 105 },
    { icon: Activity, label: "Speed", value: live.speedKmh != null ? `${live.speedKmh} km/h` : "—" },
    { icon: Zap, label: "Battery", value: live.voltage != null ? `${live.voltage.toFixed(1)} V` : "—", warn: live.voltage != null && (live.voltage < 12 || live.voltage > 15) },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-xl border p-3 ${t.warn ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><t.icon className="size-3.5" /> {t.label}</p>
          <p className="mt-0.5 font-display text-lg font-semibold tabular-nums">{t.value}</p>
        </div>
      ))}
    </div>
  )
}

// Bluetooth support never changes during a visit: work it out once, on the client only.
let supportCache: BluetoothSupport | null = null
const getSupport = () => (supportCache ??= bluetoothSupport())
const noSubscribe = () => () => {}

/**
 * P8-13: OBD-II scanner over a Bluetooth (BLE) ELM327 adapter. Reads VIN,
 * stored/pending/permanent codes, freeze frame and live data; explains each
 * code with likely parts and offers. Garage staff can clear codes (audited).
 */
export function ObdScanner({ ctx, onSaved }: { ctx: GarageCtx | DriverCtx | InspectionCtx; onSaved?: (s: SavedScan) => void }) {
  const support = useSyncExternalStore(noSubscribe, getSupport, () => null)
  const [adapter, setAdapter] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [saved, setSaved] = useState<SavedScan | null>(null)
  const [live, setLive] = useState<LiveData | null>(null)
  const [watching, setWatching] = useState(false)
  const [offersFor, setOffersFor] = useState<string | null>(null)
  const [clearReason, setClearReason] = useState("")
  const [clearOpen, setClearOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const transport = useRef<(ObdTransport & { name: string }) | null>(null)
  const busy = useRef(false)

  useEffect(() => () => { void transport.current?.close() }, [])

  // Live data: poll while "Watch live" is on.
  useEffect(() => {
    if (!watching || !transport.current) return
    let alive = true
    const tick = async () => {
      if (!alive || !transport.current || busy.current) return
      busy.current = true
      try { const l = await readLive(transport.current); if (alive) setLive(l) } catch { /* keep last values */ }
      busy.current = false
      if (alive) setTimeout(tick, 1500)
    }
    void tick()
    return () => { alive = false }
  }, [watching])

  const runScan = () => {
    setErr(null); setNote(null); setSaved(null); setScan(null); setOffersFor(null)
    start(async () => {
      try {
        if (!transport.current) {
          setStep("Choose your OBD adapter in the list…")
          transport.current = await connectBleAdapter(() => { transport.current = null; setAdapter(null); setWatching(false); setStep(null) })
          setAdapter(transport.current.name)
        }
        busy.current = true
        const r = await fullScan(transport.current, setStep)
        busy.current = false
        setScan(r)
        setLive(r.live)
        setStep("Explaining the codes…")
        const res = await saveObdScan({
          adapterName: transport.current?.name ?? null, protocol: r.protocol, vin: r.vin, milOn: r.milOn,
          dtcs: r.dtcs, freezeFrame: r.freezeFrame, live: r.live,
          ...(ctx.kind === "garage" ? { garageId: ctx.garageId, jobId: ctx.jobId } : ctx.kind === "inspection" ? { garageId: ctx.garageId, inspectionId: ctx.inspectionId } : { vehicleId: ctx.vehicleId }),
        })
        if (res.ok) { setSaved(res.data); onSaved?.(res.data) } else setErr(res.error)
      } catch (e) {
        busy.current = false
        const msg = e instanceof ObdError ? e.message : (e as Error).name === "NotFoundError" ? "No adapter chosen. Plug the adapter into the car, turn the ignition on, then try again." : (e as Error).message
        setErr(msg)
      } finally {
        setStep(null)
      }
    })
  }

  const disconnect = () => { setWatching(false); void transport.current?.close(); transport.current = null; setAdapter(null) }

  const doClear = () => {
    if (ctx.kind !== "garage" || !saved || !transport.current) return
    setErr(null)
    start(async () => {
      const auth = await authorizeObdClear({ garageId: ctx.garageId, scanId: saved.scanId, reason: clearReason })
      if (!auth.ok) { setErr(auth.error); return }
      busy.current = true
      const accepted = await clearCodes(transport.current!).catch(() => false)
      busy.current = false
      await confirmObdClear({ garageId: ctx.garageId, scanId: saved.scanId, accepted })
      setClearOpen(false); setClearReason("")
      setNote(accepted ? "Codes cleared and logged. Drive the car, then scan again to check nothing comes back." : "The car didn't accept the clear. Make sure the engine is off and the ignition is on, then try again.")
    })
  }

  const addFinding = (c: SavedScan["explanation"]["codes"][number]) => {
    if (ctx.kind !== "garage") return
    start(async () => {
      const part = c.partTypes[0]
      const r = await addJobFinding({
        garageId: ctx.garageId, jobId: ctx.jobId,
        title: `${c.code} — ${c.title}`.slice(0, 200),
        description: [c.explanation, c.checkFirst ? `Check first: ${c.checkFirst}` : null].filter(Boolean).join("\n"),
        severity: FINDING_SEV[c.severity], customerVisible: true,
        recommendation: part ? "replace" : "repair",
        ...(part ? { partTypeId: part.id } : {}),
      })
      setNote(r.ok ? `Added ${c.code} to the findings.` : r.error.message)
    })
  }

  if (!support) return null
  if (!support.ok) return <Unsupported reason={support.reason} />

  const ex = saved?.explanation
  return (
    <div className="space-y-4">
      {!scan && !pending && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Plug a Bluetooth (BLE) OBD adapter into the port under the dashboard.</li>
          <li>Turn the ignition ON (the engine can stay off) and switch on Bluetooth and location on this phone.</li>
          <li>Tap the button and pick the adapter (often called OBD, OBDII, Vgate or Veepeak).</li>
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={runScan}>
          {adapter ? <RefreshCw className="size-4" /> : <Bluetooth className="size-4" />}
          {pending && step ? step : adapter ? "Scan again" : "Connect & read codes"}
        </Button>
        {adapter && (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Plug className="size-3.5" /> {adapter}</span>
            <Button size="sm" variant="ghost" onClick={() => setWatching((w) => !w)} disabled={pending}>{watching ? "Stop live data" : "Watch live data"}</Button>
            <Button size="sm" variant="ghost" onClick={disconnect}>Disconnect</Button>
          </>
        )}
      </div>
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      {note && <p className="rounded-lg bg-surface-sunken p-3 text-sm">{note}</p>}

      {scan && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Check-engine light: <strong className={scan.milOn ? "text-red-700" : ""}>{scan.milOn == null ? "unknown" : scan.milOn ? "ON" : "off"}</strong></span>
            {scan.vin && <span>VIN: <span className="font-mono">{scan.vin}</span></span>}
            {saved?.vinMismatch && <span className="font-semibold text-amber-700">VIN doesn&apos;t match the car on file — check you scanned the right car.</span>}
          </div>

          {live && <LiveTiles live={live} />}

          {ex && (
            <div className={`rounded-xl border p-3 text-sm ${ex.overallSeverity ? SEV[ex.overallSeverity].cls : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              {ex.summary}
            </div>
          )}
          {!ex && pending && <div className="h-24 animate-pulse rounded-xl bg-muted" />}

          {ex && ex.codes.length > 0 && (
            <ul className="space-y-3">
              {ex.codes.map((c) => (
                <li key={c.code}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-bold">{c.code}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEV[c.severity].cls}`}>{SEV[c.severity].label}</span>
                        {c.kind !== "stored" && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px]">{c.kind === "pending" ? "Pending (not confirmed yet)" : "Permanent"}</span>}
                        <span className="text-xs text-muted-foreground">{c.system}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{c.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{c.explanation}</p>
                      {c.checkFirst && <p className="mt-1 text-xs"><strong>Check first:</strong> {c.checkFirst}</p>}
                      {scan.freezeFrame?.dtc === c.code && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          When it happened: {[scan.freezeFrame.rpm != null && `${scan.freezeFrame.rpm} rpm`, scan.freezeFrame.coolantC != null && `${scan.freezeFrame.coolantC}°C`, scan.freezeFrame.speedKmh != null && `${scan.freezeFrame.speedKmh} km/h`, scan.freezeFrame.loadPct != null && `${scan.freezeFrame.loadPct}% load`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {c.partTypes.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Likely parts:</span>
                          {c.partTypes.map((p) =>
                            ctx.kind === "garage" ? (
                              <button key={p.id} type="button" className={`rounded-full border px-2.5 py-1 text-xs font-medium ${offersFor === `${c.code}:${p.id}` ? "border-primary bg-primary-subtle" : "border-border"}`}
                                onClick={() => setOffersFor(offersFor === `${c.code}:${p.id}` ? null : `${c.code}:${p.id}`)}>
                                {p.name}
                              </button>
                            ) : (
                              <Link key={p.id} href={`/portal/parts?part=${p.id}`} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-muted">{p.name} → offers</Link>
                            ),
                          )}
                        </div>
                      )}
                      {ctx.kind === "garage" && offersFor?.startsWith(`${c.code}:`) && (
                        <PartOffersPanel garageId={ctx.garageId} jobId={ctx.jobId} partTypeId={offersFor.split(":")[1]} canOrder={ctx.canOrderParts} onDone={setNote} />
                      )}
                      {ctx.kind === "garage" && ctx.canAddFindings && (
                        <Button size="sm" variant="secondary" className="mt-3" disabled={pending} onClick={() => addFinding(c)}>Add to findings</Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {ctx.kind === "driver" && saved && (
            <Button asChild variant="tonal"><Link href={`/portal/requests?scan=${saved.scanId}`}>Get it fixed — send these codes to garages</Link></Button>
          )}

          {ctx.kind === "garage" && ctx.canClear && saved && scan.dtcs.length > 0 && adapter && (
            <div className="rounded-xl border border-border p-3">
              {!clearOpen ? (
                <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline" onClick={() => setClearOpen(true)}>
                  <Eraser className="size-4" /> Clear fault codes
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm">Only clear codes after the fault is fixed. This turns off the check-engine light and resets readiness monitors; it&apos;s recorded with your name.</p>
                  <input className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder="What was fixed? (e.g. replaced front O2 sensor)" value={clearReason} onChange={(e) => setClearReason(e.target.value)} maxLength={200} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" disabled={pending || clearReason.trim().length < 3} onClick={doClear}>Clear codes</Button>
                    <Button size="sm" variant="ghost" onClick={() => setClearOpen(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
