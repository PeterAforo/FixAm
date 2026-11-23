import type { FairQuoteCheck } from "@/lib/fair-quote/core"

const STYLE: Record<FairQuoteCheck["verdict"], { label: string; cls: string }> = {
  within: { label: "Fair price", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  above: { label: "Above typical", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  below: { label: "Below typical", cls: "bg-sky-50 text-sky-900 border-sky-200" },
}

/**
 * P8-09 fair-quote check: a small pill that opens to the typical range and
 * how many prices it's based on. Never names a garage.
 */
export function FairQuoteBadge({ check, audience = "customer" }: { check: FairQuoteCheck | null | undefined; audience?: "customer" | "garage" }) {
  if (!check) return null
  const s = STYLE[check.verdict]
  const note =
    check.verdict === "above"
      ? audience === "customer"
        ? "It's fine to ask the garage why — brand, quality or extra work can explain a higher price."
        : "Customers see this too. Add a note on brand or quality if the price is justified."
      : check.verdict === "below"
        ? audience === "customer"
          ? "Lower than most — you can ask which brand or grade of part this is."
          : "You're cheaper than most garages nearby."
        : null
  return (
    <details className="group inline-block align-middle">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>
        {s.label}
        <span className="opacity-60 group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-1 max-w-xs rounded-lg border border-border bg-card p-2 text-[11px] leading-snug text-muted-foreground shadow-sm">
        <p>{check.summary}</p>
        {note && <p className="mt-1">{note}</p>}
        <p className="mt-1 opacity-70">From prices on recent FixAm invoices at other garages. No garage is named.</p>
      </div>
    </details>
  )
}
