import type { PublicInspectionReport } from "@/lib/inspections/service"
import { formatGHS } from "@/lib/money"

const RESULT_STYLE: Record<string, string> = {
  pass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  attention: "bg-amber-50 text-amber-900 border-amber-200",
  fail: "bg-red-50 text-red-800 border-red-200",
  na: "bg-surface-muted text-muted-foreground border-border",
}

/** Shared inspection report renderer — used by /i/[token], the driver portal and the print view. */
export function InspectionReportView({ report, showCosts = true }: { report: PublicInspectionReport; showCosts?: boolean }) {
  const v = report.vehicle
  const car = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pre-purchase inspection · {report.number}</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{car}{v.plate ? ` · ${v.plate}` : ""}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspected by {report.garageName}
              {report.completedAt ? ` · ${new Date(report.completedAt).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}` : ""}
              {report.locationKind === "seller" ? " · at the seller's location" : " · at the garage"}
            </p>
          </div>
          {report.scorePct != null && (
            <div className="rounded-2xl bg-primary/10 px-5 py-3 text-center">
              <p className="font-display text-3xl font-bold text-primary">{report.scorePct}%</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">condition score</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{report.counts.pass} pass</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{report.counts.attention} attention</span>
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800">{report.counts.fail} fail</span>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted-foreground">{report.counts.na} n/a</span>
        </div>
      </header>

      {report.aiReport && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-lg font-bold">Inspector&apos;s summary</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{report.aiReport.summary}</p>
          {showCosts && report.aiReport.costs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimated repair costs (estimates, not quotes)</p>
              <ul className="mt-2 divide-y divide-border text-sm">
                {report.aiReport.costs.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span>{c.item}{c.note ? <span className="block text-xs text-muted-foreground">{c.note}</span> : null}</span>
                    <span className="shrink-0 font-semibold">{formatGHS(c.estimatePesewas)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Grounded in {report.garageName}&apos;s recent prices where available. Confirm any repair with the garage before buying.</p>
            </div>
          )}
        </section>
      )}

      {report.obd.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-lg font-bold">OBD-II scan</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {report.obd.map((o, i) => (
              <li key={i} className="rounded-xl bg-surface-sunken p-3">
                <p className="font-medium">{o.vin ? `VIN ${o.vin} · ` : ""}Check-engine light: {o.milOn == null ? "unknown" : o.milOn ? "ON" : "off"}</p>
                <p className="mt-0.5 text-muted-foreground">Codes: {o.codes.length ? o.codes.join(", ") : "none stored"}{o.summary ? ` — ${o.summary}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.testDriveNotes && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-lg font-bold">Test drive notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{report.testDriveNotes}</p>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Checklist results</h3>
        {report.sections.map((s) => (
          <details key={s.key} className="rounded-2xl border border-border bg-card" open={s.attention + s.fail > 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 text-sm font-semibold">
              <span>{s.label}</span>
              <span className="flex gap-1.5 text-[11px] font-semibold">
                {s.fail > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800">{s.fail} fail</span>}
                {s.attention > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">{s.attention} attention</span>}
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">{s.pass} pass</span>
              </span>
            </summary>
            <ul className="divide-y divide-border border-t border-border text-sm">
              {s.flagged.map((f, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span>{f.label}{f.note ? <span className="block text-xs text-muted-foreground">{f.note}</span> : null}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${RESULT_STYLE[f.result] ?? RESULT_STYLE.na}`}>{f.result}</span>
                </li>
              ))}
              {s.flagged.length === 0 && <li className="px-4 py-3 text-muted-foreground">No issues flagged in this section.</li>}
            </ul>
          </details>
        ))}
      </section>

      <p className="text-center text-xs text-muted-foreground">Report {report.number} · powered by FixAm · estimates are indicative only</p>
    </div>
  )
}
