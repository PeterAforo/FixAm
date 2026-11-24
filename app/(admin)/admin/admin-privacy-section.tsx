import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { adminListPrivacyRequests } from "@/lib/privacy/actions"
import { AdminPrivacyPanel } from "./admin-privacy-panel"

export async function AdminPrivacySection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/admin")
  await ensureUser()

  const [me] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.isPlatformAdmin) return null

  const requests = await adminListPrivacyRequests()

  return (
    <section className="mt-6">
      <AdminPrivacyPanel requests={requests.ok ? requests.data : []} />
    </section>
  )
}
