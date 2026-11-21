import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { adminListGarages, adminAnalytics } from "@/lib/admin/actions"
import { AdminGaragesPanel } from "./admin-garages-panel"
import { AdminAnalyticsPanel } from "./admin-analytics-panel"

export async function AdminGaragesSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/admin")
  await ensureUser()

  const [me] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.isPlatformAdmin) return null

  const [garages, analytics] = await Promise.all([adminListGarages(), adminAnalytics()])

  return (
    <>
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Platform analytics</h2>
        <p className="mt-1 text-sm text-muted-foreground">Active garages, subscriptions, MRR, message usage and renewals.</p>
        <AdminAnalyticsPanel analytics={analytics.ok ? analytics.data : null} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Garages</h2>
        <p className="mt-1 text-sm text-muted-foreground">Suspend a garage or sign in as its owner. Every impersonated action is audited.</p>
        <AdminGaragesPanel garages={garages.ok ? garages.data : []} />
      </section>
    </>
  )
}
