import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { adminListAllPlans } from "@/lib/admin/plan-actions"
import { AdminPlansPanel } from "./admin-plans-panel"

export async function AdminPlansSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/admin")
  await ensureUser()

  const [me] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.isPlatformAdmin) return null

  const plans = await adminListAllPlans()

  return (
    <section className="mt-6">
      <AdminPlansPanel plans={plans.ok ? plans.data : []} />
    </section>
  )
}
