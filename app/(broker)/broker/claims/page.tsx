import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { listBrokerClaims } from "@/lib/claims/actions"
import { CLAIM_STATUS_LABEL } from "@/lib/claims/core"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"

async function Loader() {
  await connection()
  const claims = await listBrokerClaims()
  if (!claims.length) {
    return <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No claims yet.</li>
  }
  return claims.map((c) => (
    <li key={c.id}>
      <Link href={`/broker/claims/${c.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-foreground/30">
        <div className="min-w-0">
          <p className="font-semibold">{c.number} · {c.vehicleRef}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {c.driverName}{c.driverPhone ? ` · ${c.driverPhone}` : ""} · {c.location ?? "location not given"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {c.approvedAmount != null && <span className="text-sm font-semibold">{formatGHS(BigInt(c.approvedAmount))}</span>}
          <StatusPill status={c.status}>{CLAIM_STATUS_LABEL[c.status as keyof typeof CLAIM_STATUS_LABEL] ?? c.status.replace(/_/g, " ")}</StatusPill>
        </div>
      </Link>
    </li>
  ))
}

export default function BrokerClaimsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Claims</h1>
      <p className="mt-1 text-sm text-muted-foreground">Accident claims from drivers on your book. Assess, approve an amount, and watch the garage do the repairs.</p>
      <ul className="mt-6 space-y-3">
        <Suspense fallback={<li className="h-24 animate-pulse rounded-2xl bg-muted" />}>
          <Loader />
        </Suspense>
      </ul>
    </div>
  )
}
