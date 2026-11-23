import { AlertTriangle, Clock, Wrench } from "lucide-react"
import type { TriageResult } from "@/lib/repair-requests/core"
import { SPECIALTIES } from "@/lib/repair-requests/core"

const URGENCY = {
  stop_driving: { label: "Stop driving", cls: "bg-red-50 text-red-900", icon: AlertTriangle },
  soon: { label: "Fix soon", cls: "bg-amber-50 text-amber-900", icon: Clock },
  can_wait: { label: "Can wait", cls: "bg-emerald-50 text-emerald-900", icon: Clock },
} as const

/** Shows an AI triage result — used by drivers, the Leads inbox and the job card. */
export function TriageCard({ triage, compact = false, partsHref }: { triage: TriageResult & { matchedParts?: { id: string; name: string }[] }; compact?: boolean; partsHref?: (partTypeId: string) => string }) {
  const u = URGENCY[triage.urgency]
  const spec = SPECIALTIES.find((s) => s.id === triage.specialty)?.label ?? triage.specialty
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${u.cls}`}><u.icon className="size-3.5" /> {u.label}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold"><Wrench className="size-3.5" /> {spec}</span>
        <span className="text-xs font-semibold">Usually GH₵ {triage.costRangeGhs.min.toLocaleString()}–{triage.costRangeGhs.max.toLocaleString()}</span>
      </div>
      <p className={compact ? "text-sm" : "text-base font-medium"}>{triage.summary}</p>
      {triage.safetyNote && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-900">{triage.safetyNote}</p>}
      <ul className="space-y-0.5 text-sm">
        {triage.likelyCauses.map((c) => (
          <li key={c.cause} className="flex gap-2"><span className="w-14 shrink-0 text-xs uppercase text-muted-foreground">{c.likelihood}</span> {c.cause}</li>
        ))}
      </ul>
      {(triage.matchedParts?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Parts that may be needed:{" "}
          {triage.matchedParts!.map((p, i) => (
            <span key={p.id}>{i > 0 ? ", " : ""}{partsHref ? <a className="underline" href={partsHref(p.id)}>{p.name}</a> : p.name}</span>
          ))}
        </p>
      )}
      {!compact && triage.followUps.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <p className="font-semibold">The garage may ask:</p>
          <ul className="list-disc pl-4">{triage.followUps.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">AI estimate from your description — the garage confirms after inspecting the car.</p>
    </div>
  )
}

export function MediaStrip({ media }: { media: { id: string; kind: string; url: string }[] }) {
  if (media.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto">
      {media.map((m) =>
        m.kind === "video" ? (
          <video key={m.id} src={m.url} controls className="h-24 rounded-lg bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" className="h-24 w-24 rounded-lg object-cover" /></a>
        )
      )}
    </div>
  )
}
