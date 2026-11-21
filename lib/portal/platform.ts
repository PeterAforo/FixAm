import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { uuidv7 } from "@/lib/id"

let cached: string | null = null

/**
 * Platform-owned garage used for auth/system messages to customers who have
 * no garage records yet (self-registration OTPs). Created lazily.
 */
export async function platformGarageId(): Promise<string> {
  if (cached) return cached
  const [g] = await db().select({ id: garages.id }).from(garages)
    .where(eq(garages.slug, "fixam-platform")).limit(1)
  if (g) {
    cached = g.id
    return g.id
  }
  const id = uuidv7()
  await db().insert(garages).values({
    id,
    name: "FixAm",
    slug: "fixam-platform",
    phone: "+233000000000",
    email: "hello@fixam.app",
    city: "Accra",
    region: "Greater Accra",
    status: "active",
    onboardingCompletedAt: new Date(),
  }).onConflictDoNothing()
  cached = id
  return id
}
