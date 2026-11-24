import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { runByToken, runsView } from "@/lib/pickups/service"
import { HandoverView } from "@/components/pickups/handover-view"
import { AutoRefresh } from "@/components/pickups/auto-refresh"

export const metadata = { title: "Pickup & drop-off · FixAm", robots: { index: false, follow: false } }

async function Content({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const run = await runByToken(token)
  if (!run) {
    return <p className="mt-20 text-center text-sm text-muted-foreground">This link isn&apos;t valid. Ask the garage to send it again.</p>
  }
  const [g] = await db().select({ name: garages.name, phone: garages.phone }).from(garages).where(eq(garages.id, run.garageId)).limit(1)
  const view = await runsView({ runId: run.id })
  const moving = view.runs.some((r) => ["scheduled", "assigned", "en_route", "arrived"].includes(r.status))
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <AutoRefresh active={moving} />
      <header className="mb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{g?.name}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Pickup &amp; drop-off</h1>
        {run.plate && <p className="mt-1 text-sm text-muted-foreground">{run.plate}</p>}
      </header>
      <HandoverView runs={view.runs} comparison={view.comparison} />
      <p className="mt-6 text-center text-xs text-muted-foreground">Questions? Call {g?.name} on {g?.phone}.</p>
    </div>
  )
}

export default function PickupTrackPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="min-h-dvh bg-background">
      <Suspense fallback={<div className="mx-auto mt-10 h-96 max-w-lg animate-pulse rounded-2xl bg-muted" />}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
