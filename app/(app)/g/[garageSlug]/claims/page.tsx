import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { listGarageClaims } from "@/lib/claims/actions"
import { CLAIM_STATUS_LABEL } from "@/lib/claims/core"
import { StatusPill } from "@/components/brand/status-pill"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role, garageId: garage.id, branchId: m.branchId }
  const allowed = can(principal, "claims.estimate") || can(principal, "claims.manage") || ["owner", "manager", "service_advisor"].includes(m.role)
  if (!allowed) notFound()
  const claims = await listGarageClaims(garage.id)
  return (
    <ul className="mt-6 space-y-3">
      {claims.length === 0 && <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No claims name this garage yet.</li>}
      {claims.map((c) => (
        <li key={c.id}>
          <Link href={`/g/${garageSlug}/claims/${c.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-foreground/30">
            <div className="min-w-0">
              <p className="font-semibold">{c.number} · {c.vehicleRef}</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {c.driverName}{c.driverPhone ? ` · ${c.driverPhone}` : ""} · {c.insurerName ?? "unassigned insurer"}
              </p>
            </div>
            <StatusPill status={c.status}>{CLAIM_STATUS_LABEL[c.status as keyof typeof CLAIM_STATUS_LABEL] ?? c.status.replace(/_/g, " ")}</StatusPill>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function GarageClaimsPage(props: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Insurance claims</h1>
        <p className="mt-1 text-sm text-muted-foreground">Claims drivers have pointed at this garage. Add your repair estimate — once the insurer authorises it, approve the repair.</p>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
