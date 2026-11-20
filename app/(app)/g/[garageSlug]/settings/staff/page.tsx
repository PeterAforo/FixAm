import { redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { listStaff } from "@/lib/staff/actions"
import { StaffPanel } from "./staff-panel"

async function StaffLoader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  await ensureUser()

  const [garage] = await db()
    .select()
    .from(garages)
    .where(eq(garages.slug, garageSlug))
    .limit(1)
  if (!garage) redirect("/")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership) redirect("/onboarding")
  if (membership.role !== "owner" && membership.role !== "manager") {
    redirect(`/g/${garageSlug}`)
  }

  const [staff, branchRows] = await Promise.all([
    listStaff(garage.id),
    db()
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.garageId, garage.id)),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-foreground">Team</h1>
        <p className="text-muted-foreground">
          {garage.name} · invite staff, change roles, suspend access
        </p>
      </header>
      <StaffPanel
        garageId={garage.id}
        staff={staff}
        branches={branchRows}
        currentUserId={userId}
      />
    </div>
  )
}

export default function StaffSettingsPage({
  params,
}: {
  params: Promise<{ garageSlug: string }>
}) {
  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
          <StaffLoader params={params} />
        </Suspense>
      </div>
    </main>
  )
}
