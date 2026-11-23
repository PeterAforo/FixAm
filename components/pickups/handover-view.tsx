import { CheckCircle2, Truck } from "lucide-react"
import { PHOTO_SIDES, fuelLabel, type compareReports } from "@/lib/pickups/core"
import { WARNING_LIGHTS } from "@/lib/repair-requests/core"
import type { RunView } from "@/lib/pickups/service"

const when = (iso: string) => new Date(iso).toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })
const lightLabel = (id: string) => WARNING_LIGHTS.find((l) => l.id === id)?.label ?? id.replace(/_/g, " ")
const sideLabel = (id: string) => PHOTO_SIDES.find((s) => s.id === id)?.label ?? id

/** P8-16: pickup/return runs with live status and the signed condition reports. */
export function HandoverView({ runs, comparison }: { runs: RunView[]; comparison: ReturnType<typeof compareReports> | null }) {
  if (!runs.length) return null
  return (
    <div className="space-y-4">
      {runs.map((r) => (
        <section key={r.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{r.kind === "pickup" ? "Pickup" : "Return"}</p>
              <p className="font-semibold">{r.label}</p>
              <p className="text-xs text-muted-foreground">{when(r.scheduledAt)} · {r.address}</p>
            </div>
            {r.status === "done" ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Truck className="size-5 text-muted-foreground" />}
          </div>
          {r.driverName && r.status !== "done" && (
            <p className="mt-2 text-sm">Driver: <strong>{r.driverName}</strong>{r.driverPhone && <> · <a className="underline" href={`tel:${r.driverPhone}`}>{r.driverPhone}</a></>}</p>
          )}
          {r.driverLocation && (
            <p className="mt-1 text-sm">
              <a className="text-primary underline" href={`https://www.google.com/maps/search/?api=1&query=${r.driverLocation.lat},${r.driverLocation.lng}`} target="_blank" rel="noreferrer">See where the driver is</a>
              <span className="text-xs text-muted-foreground"> · updated {new Date(r.driverLocation.at).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</span>
            </p>
          )}
          {r.report && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="text-sm font-semibold">Condition at {r.kind === "pickup" ? "pickup" : "return"}</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-sunken p-2"><p className="text-muted-foreground">Mileage</p><p className="font-semibold tabular-nums">{r.report.odometerKm?.toLocaleString("en-GH") ?? "—"} km</p></div>
                <div className="rounded-lg bg-surface-sunken p-2"><p className="text-muted-foreground">Fuel</p><p className="font-semibold">{fuelLabel(r.report.fuelLevel)}</p></div>
                <div className="rounded-lg bg-surface-sunken p-2"><p className="text-muted-foreground">Warning lights</p><p className="font-semibold">{r.report.warningLights.length ? r.report.warningLights.length : "None"}</p></div>
              </div>
              {r.report.warningLights.length > 0 && <p className="text-xs">Lights on: {r.report.warningLights.map(lightLabel).join(", ")}</p>}
              {r.report.damageNotes && <p className="text-xs">Notes: {r.report.damageNotes}</p>}
              <div className="grid grid-cols-3 gap-2">
                {r.report.photos.map((p) => (
                  <a key={p.side} href={p.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={sideLabel(p.side)} className="aspect-[4/3] w-full rounded-lg object-cover" />
                    <span className="text-[10px] text-muted-foreground">{sideLabel(p.side)}</span>
                  </a>
                ))}
              </div>
              {r.report.signatureUrl && (
                <div className="flex items-end gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.report.signatureUrl} alt="Signature" className="h-12 rounded border border-border bg-white" />
                  <p className="text-xs text-muted-foreground">Signed by {r.report.signedByName}{r.report.signedAt ? ` · ${when(r.report.signedAt)}` : ""}</p>
                </div>
              )}
            </div>
          )}
        </section>
      ))}
      {comparison && (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">Pickup vs return</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {comparison.kmDriven != null && <li>Driven while with the garage: <strong className="text-foreground">{comparison.kmDriven} km</strong> (includes the trips to and from you and any test drive)</li>}
            {comparison.fuelChange != null && <li>Fuel: {comparison.fuelChange === 0 ? "same level" : comparison.fuelChange > 0 ? `${comparison.fuelChange}% more` : `${Math.abs(comparison.fuelChange)}% less`}</li>}
            {comparison.clearedLights.length > 0 && <li>Warning lights now off: {comparison.clearedLights.map(lightLabel).join(", ")}</li>}
            {comparison.newLights.length > 0 && <li className="text-amber-700">New warning lights: {comparison.newLights.map(lightLabel).join(", ")} — ask the garage</li>}
          </ul>
        </section>
      )}
    </div>
  )
}
