import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { brokerRequests } from "@/lib/db/schema"
import { getShellContext } from "@/lib/accounts/shell-context"
import { getMyBroker } from "@/lib/brokers/actions"
import { WorkspaceShell } from "@/components/shell/workspace-shell"

async function BrokerShell({ children }: { children: ReactNode }) {
  await connection()
  const ctx = await getShellContext()
  const mine = await getMyBroker()
  if (!mine) redirect("/onboarding/insurance-broker")

  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(brokerRequests)
    .where(and(eq(brokerRequests.brokerId, mine.broker.id), eq(brokerRequests.status, "requested")))

  return (
    <WorkspaceShell
      workspaces={ctx.workspaces}
      currentKey={`broker:${mine.broker.id}`}
      user={ctx.user}
      nav={[
        { label: "Overview", href: "/broker", icon: "gauge", exact: true },
        { label: "Requests", href: "/broker/requests", icon: "inbox", badge: Number(row?.n ?? 0) || undefined },
        { label: "Settings", href: "/broker/settings", icon: "settings" },
      ]}
    >
      {children}
    </WorkspaceShell>
  )
}

export default function BrokerLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BrokerShell>{children}</BrokerShell>
    </Suspense>
  )
}
