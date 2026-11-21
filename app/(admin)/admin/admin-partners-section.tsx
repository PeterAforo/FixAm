import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { adminListInsurancePartners } from "@/lib/admin/actions"
import { AdminPartnersPanel } from "./admin-partners-panel"

export async function AdminPartnersSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/admin")
  await ensureUser()

  const [me] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.isPlatformAdmin) return null

  const partners = await adminListInsurancePartners()

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Insurance partners</h2>
      <p className="mt-1 text-sm text-muted-foreground">Agencies garages can use for agent renewals.</p>
      <AdminPartnersPanel partners={partners.ok ? partners.data : []} />
    </section>
  )
}
