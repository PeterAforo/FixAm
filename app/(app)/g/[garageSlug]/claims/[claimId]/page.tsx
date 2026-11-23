import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, jobs } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { getGarageClaim } from "@/lib/claims/actions"
import { CLAIM_STATUS_LABEL } from "@/lib/claims/core"
import { storageProvider } from "@/lib/integrations/storage"
import { StatusPill } from "@/components/brand/status-pill"
import { GarageClaimActions } from "./claim-actions"

async function signedUrls(keys: string[] | null): Promise<string[]> {
  if (!keys?.length) return []
  const sp = storageProvider()
  return Promise.all(keys.map((k) => sp.getSignedUrl(k).catch(() => k)))
}

async function Loader({ params }: { params: Promise<{ garageSlug: string; claimId: string }> }) {
  await connection()
  const { garageSlug, claimId } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "claims.estimate") && !["owner", "manager", "service_advisor"].includes(m.role)) notFound()

  const data = await getGarageClaim(garage.id, claimId)
  if (!data) notFound()
  const { claim, events } = data
  const photoUrls = await signedUrls(claim.photos)
  const docUrls = await signedUrls(claim.documents)
  const jobRows = await db()
    .select({ id: jobs.id, number: jobs.number, complaint: jobs.complaint, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.garageId, garage.id))
    .orderBy(desc(jobs.createdAt))
    .limit(50)

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">{claim.number}</h2>
            <StatusPill status={claim.status}>{CLAIM_STATUS_LABEL[claim.status as keyof typeof CLAIM_STATUS_LABEL] ?? claim.status}</StatusPill>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Driver</dt><dd>{claim.driverName}{claim.driverPhone ? ` · ${claim.driverPhone}` : ""}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</dt><dd>{claim.vehicleRef}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</dt><dd>{claim.occurredAt ? new Date(claim.occurredAt).toLocaleString("en-GH") : "—"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</dt><dd>{claim.location ?? "—"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Police report</dt><dd>{claim.policeReportNo ?? "—"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Injuries</dt><dd>{claim.injuries == null ? "—" : claim.injuries ? "Yes" : "No"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other party</dt><dd>{claim.otherParty ? [claim.otherParty.name, claim.otherParty.phone, claim.otherParty.plate, claim.otherParty.insurer].filter(Boolean).join(" · ") || "—" : "—"}</dd></div>
            {claim.description && <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened</dt><dd className="mt-1 whitespace-pre-wrap">{claim.description}</dd></div>}
          </dl>
        </section>

        {photoUrls.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Photos</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photoUrls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Claim photo ${i + 1}`} className="aspect-[4/3] w-full rounded-xl border border-border object-cover" /></a>
              ))}
            </div>
          </section>
        )}

        {docUrls.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Documents</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {docUrls.map((u, i) => <li key={i}><a className="text-primary underline" href={u} target="_blank" rel="noreferrer">Document {i + 1}</a></li>)}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Timeline</h2>
          <ol className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground/40" />
                <div>
                  <p className="font-medium capitalize">{e.status.replace(/_/g, " ")} <span className="font-normal text-muted-foreground">· {e.actor}</span></p>
                  {e.note && <p className="text-muted-foreground">{e.note}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString("en-GH")}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside>
        <GarageClaimActions
          garageId={garage.id}
          claimId={claim.id}
          status={claim.status}
          estimateAmount={claim.estimateAmount}
          approvedAmount={claim.approvedAmount}
          jobId={claim.jobId}
          jobs={jobRows.map((j) => ({ id: j.id, label: `${j.number}${j.complaint ? ` — ${j.complaint.slice(0, 40)}` : ""}` }))}
        />
      </aside>
    </div>
  )
}

export default function GarageClaimPage(props: { params: Promise<{ garageSlug: string; claimId: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Claim</h1>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
