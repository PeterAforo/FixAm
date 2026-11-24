import { Suspense, type ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { ensureUser, getSessionUserId } from "@/lib/auth/ensure-user"
import { adminAttention, approvalsWaiting, isPlatformAdmin } from "@/lib/admin/overview"
import { listMyWorkspaces } from "@/lib/accounts/workspaces"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { AdminNav } from "./admin-nav"

async function AdminShell({ children }: { children: ReactNode }) {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  await ensureUser()

  if (!(await isPlatformAdmin(userId))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm rounded-[22px] border border-border bg-card p-8 text-center">
          <h1 className="font-display text-2xl font-bold">Platform admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">This area is for the FixAm team.</p>
          <Link href="/account" className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Back to your workspaces
          </Link>
        </div>
      </main>
    )
  }

  // Sequential on purpose: the pooler is happier with one warm connection (see lib/admin/overview.ts).
  const a = await adminAttention()
  const workspaces = await listMyWorkspaces(userId)
  const [me] = await db().select({ defaultWorkspace: users.defaultWorkspace }).from(users).where(eq(users.id, userId)).limit(1)
  return (
    <div className="min-h-screen bg-background md:flex">
      <AdminNav
        badges={{ approvals: approvalsWaiting(a), payments: a.disputes + a.payoutsNeedAttention, privacy: a.privacyOpen }}
        workspaces={workspaces}
        defaultKey={me?.defaultWorkspace ?? null}
      />
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 md:px-10 md:pt-8">{children}</main>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  )
}
