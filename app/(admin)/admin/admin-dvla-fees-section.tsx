import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { adminListDvlaFees } from "@/lib/dvla/actions"
import { AdminDvlaFeesPanel } from "./admin-dvla-fees-panel"

export async function AdminDvlaFeesSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/admin")
  await ensureUser()

  const [me] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.isPlatformAdmin) return null

  const fees = await adminListDvlaFees()

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">DVLA fee table</h2>
      <p className="mt-1 text-sm text-muted-foreground">Official fees shown to garages when renewing roadworthy, registration and licence records.</p>
      <AdminDvlaFeesPanel fees={fees.ok ? fees.data : []} />
    </section>
  )
}
