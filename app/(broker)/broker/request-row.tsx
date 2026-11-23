import Link from "next/link"
import type { BrokerRequestView } from "@/lib/brokers/actions"
import { REQUEST_STATUS } from "@/lib/brokers/catalog"
import { formatGHS } from "@/lib/money"
import { StatusPill } from "@/components/brand/status-pill"

export function RequestRow({ r }: { r: BrokerRequestView }) {
  const st = REQUEST_STATUS[r.status]
  return (
    <Link href={`/broker/requests/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-muted/60">
      <span className="rounded-md border border-foreground/80 bg-white px-2 py-0.5 font-mono text-xs font-semibold text-[#16130F]">{r.vehiclePlate}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{r.serviceLabel} · {r.requesterName}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {r.number} · {r.source === "garage" ? "From a garage" : "From a driver"} · {new Date(r.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
        </span>
      </span>
      {r.total != null && <span className="hidden text-sm font-semibold tabular-nums sm:block">{formatGHS(r.total)}</span>}
      <StatusPill tone={st?.tone ?? "neutral"} size="sm">{st?.label ?? r.status}</StatusPill>
    </Link>
  )
}
