import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { deliveryOffers, deliveries } from "@/lib/db/schema"
import { getShellContext } from "@/lib/accounts/shell-context"
import { getMyRider } from "@/lib/riders/actions"
import { WorkspaceShell } from "@/components/shell/workspace-shell"

async function RiderShell({ children }: { children: ReactNode }) {
  await connection()
  const ctx = await getShellContext()
  const rider = await getMyRider()
  if (!rider) redirect("/onboarding/rider")
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(deliveryOffers)
    .innerJoin(deliveries, eq(deliveries.id, deliveryOffers.deliveryId))
    .where(and(eq(deliveryOffers.riderId, rider.id), isNull(deliveryOffers.declinedAt), eq(deliveries.status, "offered")))
  return (
    <WorkspaceShell
      workspaces={ctx.workspaces}
      currentKey={`rider:${rider.id}`}
      user={ctx.user}
      nav={[
        { label: "Deliveries", href: "/rider", icon: "truck", exact: true, badge: Number(row?.n ?? 0) || undefined },
        { label: "Earnings", href: "/rider/earnings", icon: "wallet" },
      ]}
    >
      {children}
    </WorkspaceShell>
  )
}

export default function RiderLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RiderShell>{children}</RiderShell>
    </Suspense>
  )
}
