import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getPartsShopContext } from "@/lib/parts-shop/actions"
import { listMyClaims } from "@/lib/claims/actions"
import { CLAIM_STATUS_LABEL, type ClaimStatus } from "@/lib/claims/core"
import { StatusPill } from "@/components/brand/status-pill"
import { Button } from "@/components/brand/button"

const TONE: Record<string, "neutral" | "info" | "ok" | "warning" | "danger"> = {
  draft: "neutral",
  submitted: "info",
  assessing: "info",
  approved: "ok",
  partially_approved: "warning",
  rejected: "danger",
  repair_authorised: "ok",
  settled: "ok",
}

async function Loader() {
  await connection()
  const [ctx, claims] = await Promise.all([getPartsShopContext(), listMyClaims()])
  if (!ctx) redirect("/onboarding/driver")
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Insurance claims</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Had an accident? File a claim in a few minutes — photos, police report, the other driver&apos;s details. Your broker or insurer picks it up from there.
          </p>
        </div>
        <Button asChild><Link href="/portal/claims/new">New claim</Link></Button>
      </div>

      {claims.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">No claims yet</p>
          <p className="mt-1 text-sm text-muted-foreground">When it happens, start here — it takes under 5 minutes.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {claims.map((c) => (
            <li key={c.id}>
              <Link href={`/portal/claims/${c.id}`} className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.number} · {c.vehicleRef}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.occurredAt ? new Date(c.occurredAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "Date not set"}
                      {c.garageName ? ` · ${c.garageName}` : ""}
                      {c.insurerName ?? c.brokerName ? ` · ${c.insurerName ?? c.brokerName}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={TONE[c.status] ?? "neutral"}>{CLAIM_STATUS_LABEL[c.status as ClaimStatus] ?? c.status}</StatusPill>
                </div>
                {c.approvedAmount != null && (
                  <p className="mt-2 text-sm">Approved: <span className="font-semibold">GH₵{(c.approvedAmount / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</span></p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ClaimsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Loader />
      </Suspense>
    </div>
  )
}
