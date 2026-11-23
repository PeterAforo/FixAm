import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { getShellContext } from "@/lib/accounts/shell-context"
import { resolveVendorMembership } from "@/lib/vendors/actions"
import { WorkspaceShell } from "@/components/shell/workspace-shell"

async function VendorShell({ children }: { children: ReactNode }) {
  await connection()
  const ctx = await getShellContext()
  const m = await resolveVendorMembership(ctx.userId)
  if (!m) redirect("/onboarding/parts-seller")

  return (
    <WorkspaceShell
      workspaces={ctx.workspaces}
      currentKey={`vendor:${m.vendor.id}`}
      user={ctx.user}
      nav={[{ label: "My shop", href: "/vendor", icon: "store", exact: true }]}
    >
      {children}
    </WorkspaceShell>
  )
}

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <VendorShell>{children}</VendorShell>
    </Suspense>
  )
}
