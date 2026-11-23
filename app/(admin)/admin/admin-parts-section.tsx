import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { listPartTypes } from "@/lib/parts-catalog/actions"
import { AdminPartsPanel } from "./admin-parts-panel"

export async function AdminPartsSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) return null
  const [me] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.a) return null
  const parts = await listPartTypes()
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Parts list</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        FixAm&apos;s standard part names. Add the names people really use — including Twi, Ga, Ewe and Hausa — so vendors, mechanics and
        drivers all match to the same part.
      </p>
      <AdminPartsPanel parts={parts} />
    </section>
  )
}
