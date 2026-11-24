import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages, notifications, users } from "@/lib/db/schema"
import { createClient } from "@/lib/auth/supabase/server"
import { ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership, resolvePrincipal } from "@/lib/actions"
import { AppShell } from "@/components/shell/app-shell"
import { listMyWorkspaces } from "@/lib/accounts/workspaces"
import { getImpersonation } from "@/lib/admin/impersonation"
import type { StaffRole } from "@/lib/auth/permissions"
import type { ShellNotification } from "@/components/shell/notifications-bell"

async function ShellLoader({
  params,
  children,
}: {
  params: Promise<{ garageSlug: string }>
  children: React.ReactNode
}) {
  await connection()
  const { garageSlug } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/g/${garageSlug}`)
  await ensureUser()

  const [garage] = await db()
    .select()
    .from(garages)
    .where(eq(garages.slug, garageSlug))
    .limit(1)
  if (!garage) redirect("/onboarding")

  // Suspended garages lock out staff; a platform admin "viewing as owner" still gets in.
  if (garage.status === "suspended") {
    const imp = await getImpersonation()
    if (!(imp && imp.adminId === user.id && imp.garageId === garage.id)) {
      return <GarageSuspended name={garage.name} />
    }
  }

  const ctx = await resolvePrincipal(user.id, garage.id)
  if (!ctx) redirect("/onboarding")

  const membership = await resolveMembership(user.id, garage.id)
  const role =
    ctx.principal.kind === "staff"
      ? (ctx.principal.role as StaffRole)
      : "service_advisor"

  const [branchRows, me, recent, workspaces] = await Promise.all([
    db()
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.garageId, garage.id)),
    db().select().from(users).where(eq(users.id, user.id)).limit(1),
    db()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(20),
    listMyWorkspaces(user.id),
  ])

  const cookieStore = await cookies()
  const cookieBranch = cookieStore.get("fixam_branch_id")?.value ?? null
  const activeBranchId =
    membership?.branchId ??
    (cookieBranch && branchRows.some((b) => b.id === cookieBranch) ? cookieBranch : null)

  const shellNotifications: ShellNotification[] = recent.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    kind: n.kind,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  }))

  const imp = await getImpersonation()
  const impersonating = imp?.garageId === garage.id

  return (
    <AppShell
      impersonating={impersonating}
      workspaces={workspaces}
      defaultKey={me[0]?.defaultWorkspace ?? null}
      garageId={garage.id}
      garageSlug={garage.slug}
      garageName={garage.name}
      role={role}
      userId={user.id}
      userName={me[0]?.fullName ?? user.email ?? "FixAm user"}
      userEmail={user.email ?? ""}
      branches={branchRows}
      activeBranchId={activeBranchId}
      notifications={shellNotifications}
    >
      {children}
    </AppShell>
  )
}

function GarageSuspended({ name }: { name: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-[22px] border border-border bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-bold">{name} is suspended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          FixAm has paused this garage, so staff can&apos;t open it right now. The owner can contact FixAm support to sort it out.
        </p>
        <Link href="/account" className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Back to your workspaces
        </Link>
      </div>
    </main>
  )
}

export default function GarageLayout({
  params,
  children,
}: {
  params: Promise<{ garageSlug: string }>
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <ShellLoader params={params}>{children}</ShellLoader>
    </Suspense>
  )
}
