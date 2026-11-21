import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { estimates, garages, jobItems, jobs } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { EstimatePanel } from "./estimate-panel"

async function EstimateLoader({ params }: { params: Promise<{ garageSlug: string; jobId: string }> }) {
  await connection()
  const { garageSlug, jobId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/jobs/${jobId}/estimate`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()

  const [job] = await db()
    .select({ id: jobs.id, number: jobs.number, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.garageId, garage.id), isNull(jobs.deletedAt)))
    .limit(1)
  if (!job) notFound()

  const estRows = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.jobId, job.id), eq(estimates.garageId, garage.id)))
    .orderBy(desc(estimates.version))

  const principal = { kind: "staff" as const, role: m.role, garageId: garage.id, branchId: m.branchId }

  return (
    <EstimatePanel
      garageSlug={garageSlug}
      garageId={garage.id}
      job={{ id: job.id, number: job.number, status: job.status }}
      estimates={estRows.map((e) => ({
        id: e.id,
        number: e.number,
        version: e.version,
        status: e.status,
        subtotal: Number(e.subtotal),
        discountTotal: Number(e.discountTotal),
        taxTotal: Number(e.taxTotal),
        total: Number(e.total),
        depositRequired: Number(e.depositRequired ?? 0),
        validUntil: e.validUntil,
        sentAt: e.sentAt?.toISOString() ?? null,
      }))}
      items={(await db().select().from(jobItems).where(and(eq(jobItems.jobId, job.id), eq(jobItems.garageId, garage.id))).orderBy(jobItems.sortOrder)).map((i) => ({
        id: i.id,
        type: i.type,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountAmount: Number(i.discountAmount ?? 0),
        estimateId: i.estimateId,
        approvalStatus: i.approvalStatus,
      }))}
      canCreate={can(principal, "estimates.create")}
      canSend={can(principal, "estimates.send")}
      canBehalf={can(principal, "estimates.approve_on_behalf")}
    />
  )
}

export default function EstimatePage({ params }: { params: Promise<{ garageSlug: string; jobId: string }> }) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <EstimateLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
