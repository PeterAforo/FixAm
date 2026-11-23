import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getPickupSettings, listGarageDrivers, listRuns, runSources } from "@/lib/pickups/actions"
import { PickupsPanel } from "./pickups-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const [g] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!g) notFound()
  const runs = await listRuns({ garageId: g.id })
  if (!runs) notFound()
  const [drivers, sources, settings] = runs.canManage
    ? await Promise.all([listGarageDrivers(g.id), runSources(g.id), getPickupSettings(g.id)])
    : [[], { bookings: [], jobs: [] }, null]
  return <PickupsPanel garageId={g.id} garageSlug={garageSlug} initial={runs} drivers={drivers} sources={sources} defaultFee={settings?.fee ?? 0} />
}

export default function PickupsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Pickups &amp; drop-offs</h1>
      <p className="text-sm text-muted-foreground">Collect customers&apos; cars and bring them back, with a signed photo report at every handover.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader params={params} />
      </Suspense>
    </div>
  )
}
