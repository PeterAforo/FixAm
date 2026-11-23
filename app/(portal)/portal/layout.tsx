import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { getShellContext } from "@/lib/accounts/shell-context"
import { WorkspaceShell } from "@/components/shell/workspace-shell"

async function DriverShell({ children }: { children: ReactNode }) {
  await connection()
  const ctx = await getShellContext()
  if (!ctx.phone) redirect("/onboarding/driver")

  return (
    <WorkspaceShell
      workspaces={ctx.workspaces}
      currentKey="driver"
      user={ctx.user}
      cta={{ label: "Renew insurance or roadworthy", href: "/portal/renewals?new=1" }}
      nav={[
        { label: "My cars", href: "/portal", icon: "car", exact: true },
        { label: "Renewals", href: "/portal/renewals", icon: "shield" },
        { label: "Profile", href: "/portal/settings", icon: "user" },
      ]}
    >
      {children}
    </WorkspaceShell>
  )
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DriverShell>{children}</DriverShell>
    </Suspense>
  )
}
