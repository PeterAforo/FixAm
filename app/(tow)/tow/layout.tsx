import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { sosRecipients, sosRequests } from "@/lib/db/schema"
import { getShellContext } from "@/lib/accounts/shell-context"
import { getMyOperator } from "@/lib/towing/actions"
import { WorkspaceShell } from "@/components/shell/workspace-shell"
import { SubscriptionGate } from "@/components/billing/subscription-gate"

async function TowShell({ children }: { children: ReactNode }) {
  await connection()
  const ctx = await getShellContext()
  const op = await getMyOperator()
  if (!op) redirect("/onboarding/tow-operator")
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(sosRecipients)
    .innerJoin(sosRequests, eq(sosRequests.id, sosRecipients.sosId))
    .where(and(eq(sosRecipients.operatorId, op.id), eq(sosRequests.status, "searching"), isNull(sosRecipients.declinedAt)))
  return (
    <WorkspaceShell
      workspaces={ctx.workspaces}
      currentKey={`tow:${op.id}`}
      user={ctx.user}
      nav={[
        { label: "Jobs", href: "/tow", icon: "truck", exact: true, badge: Number(row?.n ?? 0) || undefined },
        { label: "Settings", href: "/tow/settings", icon: "settings" },
      ]}
    >
      <SubscriptionGate owner={{ kind: "tow", ownerId: op.id }}>{children}</SubscriptionGate>
    </WorkspaceShell>
  )
}

export default function TowLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <TowShell>{children}</TowShell>
    </Suspense>
  )
}
