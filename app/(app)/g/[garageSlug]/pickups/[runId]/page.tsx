import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getRunDetail } from "@/lib/pickups/actions"
import { HandoverView } from "@/components/pickups/handover-view"
import { RunPanel } from "./run-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string; runId: string }> }) {
  await connection()
  const { garageSlug, runId } = await params
  const [g] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!g) notFound()
  const d = await getRunDetail({ garageId: g.id, runId })
  if (!d) notFound()
  return (
    <div className="mt-4 space-y-4">
      <RunPanel garageId={g.id} run={d.run} />
      <HandoverView runs={d.view.runs} comparison={d.view.comparison} />
    </div>
  )
}

export default function RunPage({ params }: { params: Promise<{ garageSlug: string; runId: string }> }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <BackLink params={params} />
        <Loader params={params} />
      </Suspense>
    </div>
  )
}

async function BackLink({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  return <Link href={`/g/${garageSlug}/pickups`} className="text-sm text-muted-foreground underline">← Pickups</Link>
}
