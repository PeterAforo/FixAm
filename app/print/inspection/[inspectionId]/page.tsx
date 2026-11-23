import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { getInspection } from "@/lib/inspections/service"
import { summariseResults, INSPECTION_SECTIONS } from "@/lib/inspections/core"
import { formatGHS } from "@/lib/money"
import { PrintButton } from "./print-button"

export const metadata = { title: "Inspection report · FixAm", robots: { index: false } }

async function Content({ params }: { params: Promise<{ inspectionId: string; garageSlug?: string }> }) {
  await connection()
  const { inspectionId } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  // Find the inspection's garage via a membership-agnostic lookup is not allowed;
  // resolve garage from the inspection row through any membership the user has.
  const { db } = await import("@/lib/db")
  const { inspections } = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  const [row] = await db().select({ garageId: inspections.garageId }).from(inspections).where(eq(inspections.id, inspectionId)).limit(1)
  if (!row) notFound()
  const m = await resolveMembership(userId, row.garageId)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as never, garageId: row.garageId, branchId: m.branchId }
  if (!can(principal, "inspections.perform")) notFound()
  const detail = await getInspection(row.garageId, inspectionId)
  if (!detail || detail.inspection.status !== "completed") notFound()
  const insp = detail.inspection
  const counts = summariseResults(detail.items)
  const ai = insp.aiReport as { summary?: string; costs?: { item: string; estimatePesewas: number; note?: string | null }[] } | null
  const v = insp.vehicleDetails as { make?: string; model?: string; year?: string; plate?: string; vin?: string }
  const car = [v.year, v.make, v.model].filter(Boolean).join(" ")

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-8 text-neutral-900 print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold">Inspection report — {insp.number}</h1>
          <p className="text-sm text-neutral-600">{car}{v.plate ? ` · ${v.plate}` : ""} · {detail.garageName}</p>
        </div>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-neutral-300 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">FixAm Pre-Purchase Inspection</p>
            <p className="text-lg font-bold">{car || "Vehicle"}{v.plate ? ` — ${v.plate}` : ""}</p>
            <p className="text-xs text-neutral-600">
              {detail.garageName} · {insp.completedAt ? insp.completedAt.toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" }) : ""}
              {insp.locationKind === "seller" ? " · inspected at seller's location" : ""}
            </p>
          </div>
          {counts.answered > 0 && (
            <div className="text-right">
              <p className="text-3xl font-bold">{counts.scorePct}%</p>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">condition score</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-3 text-xs font-semibold">
          <span className="text-emerald-700">{counts.pass} pass</span>
          <span className="text-amber-700">{counts.attention} attention</span>
          <span className="text-red-700">{counts.fail} fail</span>
          <span className="text-neutral-500">{counts.na} n/a</span>
        </div>
      </div>

      {ai?.summary && (
        <section className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Inspector&apos;s summary</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{ai.summary}</p>
        </section>
      )}

      {ai?.costs && ai.costs.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Estimated repair costs (estimates, not quotes)</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {ai.costs.map((c, i) => (
                <tr key={i} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-3">{c.item}{c.note ? <span className="block text-xs text-neutral-500">{c.note}</span> : null}</td>
                  <td className="py-1.5 text-right font-semibold">{formatGHS(c.estimatePesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {detail.obd.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">OBD-II scan</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {detail.obd.map((o) => (
              <li key={o.id}>
                {o.vin ? `VIN ${o.vin} · ` : ""}MIL {o.milOn ? "on" : "off"} · codes: {Array.isArray(o.dtcs) && o.dtcs.length ? (o.dtcs as { code: string }[]).map((d) => d.code).join(", ") : "none"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {insp.testDriveNotes && (
        <section className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Test drive notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{insp.testDriveNotes}</p>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Checklist — flagged items</h2>
        {INSPECTION_SECTIONS.map((s) => {
          const flagged = detail.items.filter((i) => i.section === s.key && (i.result === "attention" || i.result === "fail"))
          if (!flagged.length) return null
          return (
            <div key={s.key} className="mt-3">
              <p className="text-xs font-bold text-neutral-600">{s.label}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {flagged.map((f) => (
                  <li key={f.id} className="flex justify-between gap-3">
                    <span>{f.label}{f.note ? <span className="block text-xs text-neutral-500">{f.note}</span> : null}</span>
                    <span className="font-semibold uppercase">{f.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      <p className="mt-8 text-center text-[10px] text-neutral-400">FixAm inspection report {insp.number} · estimates are indicative only · {detail.garageName}</p>
    </main>
  )
}

export default function PrintInspectionPage({ params }: { params: Promise<{ inspectionId: string; garageSlug?: string }> }) {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <Content params={params} />
    </Suspense>
  )
}
