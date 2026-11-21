import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { adminListVendors } from "@/lib/vendors/actions"
import { AdminVendorsPanel } from "./admin-vendors-panel"

export async function AdminVendorsSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/admin")
  await ensureUser()

  const [me] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.isPlatformAdmin) {
    return (
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Vendors</h2>
        <p className="mt-2 text-sm text-muted-foreground">Platform admin access required.</p>
      </section>
    )
  }

  const vendors = await adminListVendors({})

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Vendor approvals</h2>
      <p className="mt-1 text-sm text-muted-foreground">Pending vendors stay invisible in the marketplace until approved.</p>
      <AdminVendorsPanel vendors={vendors.ok ? vendors.data : []} />
    </section>
  )
}
