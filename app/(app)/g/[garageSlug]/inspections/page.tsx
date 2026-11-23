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
import { listGarageInspectionsAction } from "@/lib/inspections/actions"
import { formatGHS } from "@/lib/money"

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  booked: "Booked",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
}

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as never, garageId: garage.id, branchId: m.branchId }
  const canSee = can(principal, "inspections.perform") || can(principal, "jobs.view")
  if (!canSee) notFound()
  const rows = await listGarageInspectionsAction(garage.id)
  return (
    <ul className="mt-6 space-y-2">
      {rows.length === 0 && (
        <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No inspections yet. Drivers book them from their portal when your garage has inspections switched on in Settings.
        </li>
      )}
      {rows.map((r) => {
        const v = r.vehicleDetails as { make?: string; model?: string; plate?: string }
        const car = [v.make, v.model].filter(Boolean).join(" ") || "Vehicle"
        return (
          <li key={r.id}>
            <Link href={`/g/${garageSlug}/inspections/${r.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-foreground/30">
              <div className="min-w-0">
                <p className="font-semibold">{r.number} · {car}{v.plate ? ` (${v.plate})` : ""}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {r.driverPhone} · {r.locationKind === "seller" ? "seller visit" : "at garage"}
                  {r.scheduledAt ? ` · ${new Date(r.scheduledAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span>{formatGHS(r.price)}</span>
                <span className={`rounded-full px-2.5 py-1 font-semibold ${r.status === "completed" ? "bg-emerald-50 text-emerald-800" : r.status === "in_progress" ? "bg-primary/10 text-primary" : "bg-surface-muted"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export default function GarageInspectionsPage(props: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Pre-purchase inspections</h1>
        <p className="mt-1 text-sm text-muted-foreground">Driver-booked inspections. Open one to run the checklist, attach an OBD scan and generate the report.</p>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
