import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { deliveriesForRider, riderForUser } from "@/lib/riders/service"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { formatGHS } from "@/lib/money"
import { StatusPill } from "@/components/brand/status-pill"
import { DELIVERY_STATUS_LABEL } from "@/lib/riders/core"

function summarize(rows: Awaited<ReturnType<typeof deliveriesForRider>>) {
  const done = rows.filter((d) => d.status === "delivered")
  const total = done.reduce((s, d) => s + (d.riderEarning ?? 0n), 0n)
  const cutoff = Date.now() - 24 * 3600_000
  const last24 = done.filter((d) => d.deliveredAt && d.deliveredAt.getTime() > cutoff).reduce((s, d) => s + (d.riderEarning ?? 0n), 0n)
  return { done, total, last24 }
}

async function Loader() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) return null
  const rider = await riderForUser(userId)
  if (!rider) return null
  const rows = await deliveriesForRider(rider.id)
  const { done, total, last24 } = summarize(rows)
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total earned</p>
          <p className="mt-1 font-display text-2xl font-semibold">{formatGHS(total)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliveries</p>
          <p className="mt-1 font-display text-2xl font-semibold">{done.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 24 h</p>
          <p className="mt-1 font-display text-2xl font-semibold">{formatGHS(last24)}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Earnings pay to your MoMo after each confirmed delivery — usually within minutes.</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No deliveries yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id}>
              <Link href={`/rider/jobs/${d.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-foreground/30">
                <div className="min-w-0">
                  <p className="font-semibold">{d.number}</p>
                  <p className="text-xs text-muted-foreground">{d.deliveredAt ? new Date(d.deliveredAt).toLocaleString("en-GH") : new Date(d.createdAt).toLocaleDateString("en-GH")}</p>
                </div>
                <div className="flex items-center gap-3">
                  {d.riderEarning != null && <span className="font-semibold">{formatGHS(d.riderEarning)}</span>}
                  <StatusPill status={d.status}>{DELIVERY_STATUS_LABEL[d.status as keyof typeof DELIVERY_STATUS_LABEL] ?? d.status}</StatusPill>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RiderEarningsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Earnings</h1>
      <div className="mt-6">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader />
        </Suspense>
      </div>
    </div>
  )
}
