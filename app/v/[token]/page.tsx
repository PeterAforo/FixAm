import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { loadPublicPassport, type PublicPassport } from "@/lib/passport/service"

export const metadata = {
  title: "Vehicle passport · FixAm",
  description: "Service history from FixAm garages.",
  robots: { index: false, follow: false },
}

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GH", { month: "short", year: "numeric", timeZone: "UTC" })
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const km = (n: number) => `${n.toLocaleString("en-GH")} km`
const cap = (s: string | null) => (s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : "")

function MileageChart({ points }: { points: { km: number; month: string }[] }) {
  if (points.length < 2) return null
  const max = Math.max(...points.map((p) => p.km))
  const min = Math.min(...points.map((p) => p.km))
  const span = Math.max(1, max - min)
  const w = 320, h = 90, pad = 6
  const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (w - pad * 2), h - pad - ((p.km - min) / span) * (h - pad * 2)] as const)
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" aria-label={`Mileage from ${km(points[0].km)} to ${km(points[points.length - 1].km)}`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" points={xy.map(([x, y]) => `${x},${y}`).join(" ")} />
        {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" className="fill-primary" />)}
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>{monthLabel(points[0].month)} · {km(points[0].km)}</span>
        <span>{monthLabel(points[points.length - 1].month)} · {km(points[points.length - 1].km)}</span>
      </figcaption>
    </figure>
  )
}

function Passport({ p }: { p: PublicPassport }) {
  const c = p.car
  const title = [c.year, c.make, c.model].filter(Boolean).join(" ")
  const proofTotal = p.visits.reduce((a, v) => a + v.partsWithProof, 0)
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">FixAm Vehicle Passport</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 inline-block rounded-md border-2 border-foreground bg-white px-3 py-1 font-mono text-sm font-bold tracking-wider text-neutral-900">{c.plateNumber}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {[cap(c.color), cap(c.bodyType), cap(c.fuelType)].filter(Boolean).join(" · ")}
        </p>
      </header>

      <section className="mt-6 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border bg-card p-3"><p className="font-display text-2xl font-bold tabular-nums">{p.visits.length}</p><p className="text-[11px] text-muted-foreground">service visits</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="font-display text-2xl font-bold tabular-nums">{p.garagesCount}</p><p className="text-[11px] text-muted-foreground">{p.garagesCount === 1 ? "garage" : "garages"}</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="font-display text-2xl font-bold tabular-nums">{proofTotal}</p><p className="text-[11px] text-muted-foreground">parts with proof</p></div>
      </section>

      {p.mileage && p.mileage.status !== "none" && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Mileage</h2>
          {p.mileage.status === "consistent" ? (
            <p className="mt-1 text-sm"><span className="font-semibold text-emerald-700">✓ Only went up</span> across {p.mileage.readings} readings. Last: {km(p.mileage.latestKm)} ({dayLabel(p.mileage.latestAt)}).</p>
          ) : (
            <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              ⚠ Mileage went down around {dayLabel(p.mileage.droppedOn)} (from {km(p.mileage.fromKm)} to {km(p.mileage.toKm)}). This can be a typing mistake or a replaced dashboard — ask the seller.
            </p>
          )}
          <MileageChart points={p.mileageTimeline} />
        </section>
      )}

      {p.papers.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Road papers</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {p.papers.map((x) => (
              <li key={x.label} className="flex items-center justify-between">
                <span>{x.label}</span>
                <span className={x.status === "valid" ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
                  {x.status === "valid" ? `Valid until ${monthLabel(x.until)}` : `Expired ${monthLabel(x.until)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">As recorded by FixAm garages. Check the papers themselves before buying.</p>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">Service history</h2>
        {p.visits.length === 0 ? (
          <p className="mt-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No completed visits at FixAm garages yet.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
            {p.visits.map((v, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-sm font-semibold">{dayLabel(v.date)}</p>
                    <p className="text-xs text-muted-foreground">{[v.garage, cap(v.city)].filter(Boolean).join(" · ")}</p>
                  </div>
                  {(v.odometerKm || v.warranty) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{[v.odometerKm ? km(v.odometerKm) : null, v.warranty ? "Warranty repair" : null].filter(Boolean).join(" · ")}</p>
                  )}
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm">
                    {v.work.map((w) => <li key={w}>{w}</li>)}
                    {v.more > 0 && <li className="list-none text-xs text-muted-foreground">+ {v.more} more</li>}
                  </ul>
                  {v.partsWithProof > 0 && <p className="mt-2 text-[11px] font-medium text-emerald-700">✓ {v.partsWithProof} replaced {v.partsWithProof === 1 ? "part" : "parts"} with proof</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {p.inspectionReports.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Pre-purchase inspections</h2>
          <p className="mt-1 text-xs text-muted-foreground">Independent checks done before this car was bought.</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {p.inspectionReports.map((r) => (
              <li key={r.number} className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.number}</span>
                <span className="text-xs text-muted-foreground">{[r.garageName, r.completedAt ? dayLabel(r.completedAt) : null].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <p>Shared by the car&apos;s owner. Only work done at FixAm garages is shown; the owner&apos;s details and prices are private.</p>
        {p.firstSeen && <p className="mt-1">On FixAm since {monthLabel(p.firstSeen.slice(0, 7))}</p>}
        <Link href="/" className="mt-3 inline-block font-semibold text-primary">FixAm — find a garage you can trust</Link>
      </footer>
    </div>
  )
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const p = await loadPublicPassport(token, { countView: true }).catch(() => null)
  if (!p) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">FixAm Vehicle Passport</p>
        <h1 className="mt-2 font-display text-2xl font-bold">This passport isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted-foreground">The owner may have switched it off or made a new link. Ask them for the current link.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-primary">Go to FixAm</Link>
      </div>
    )
  }
  return <Passport p={p} />
}

export default function VehiclePassportPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<div className="mx-auto mt-10 h-96 max-w-lg animate-pulse rounded-2xl bg-muted" />}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
