import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { getShellContext } from "@/lib/accounts/shell-context"
import { WorkspaceShell } from "@/components/shell/workspace-shell"
import { SubscriptionGate } from "@/components/billing/subscription-gate"

async function DriverShell({ children }: { children: ReactNode }) {
  await connection()
  const ctx = await getShellContext()
  if (!ctx.phone) redirect("/onboarding/driver")

  return (
    <WorkspaceShell
      workspaces={ctx.workspaces}
      defaultKey={ctx.defaultKey}
      currentKey="driver"
      user={ctx.user}
      cta={{ label: "Breakdown SOS", href: "/portal/sos", tone: "danger" }}
      nav={[
        { label: "Home", href: "/portal", icon: "home", exact: true },
        { label: "Repairs", href: "/portal/requests", icon: "wrench" },
        { label: "Parts & orders", href: "/portal/parts", icon: "bag" },
        { label: "Renewals", href: "/portal/renewals", icon: "shield" },
        { label: "Claims", href: "/portal/claims", icon: "fileText" },
        { label: "Car inspections", href: "/portal/inspections", icon: "search" },
        { label: "Pay later", href: "/portal/financing", icon: "calendarClock" },
        { label: "Price check", href: "/portal/price-check", icon: "scale" },
        { label: "Profile & notifications", href: "/portal/settings", icon: "user" },
      ]}
    >
      <SubscriptionGate owner={{ kind: "driver", ownerId: ctx.phone }}>{children}</SubscriptionGate>
    </WorkspaceShell>
  )
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <DriverShell>{children}</DriverShell>
    </Suspense>
  )
}
