import "server-only"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageSettings, jobItems } from "@/lib/db/schema"

/** Billable (approved or pending) part lines on a job that still lack old-part proof (empty when the garage turned the rule off). */
export async function missingOldPartProof(garageId: string, jobId: string): Promise<string[]> {
  const [settings] = await db().select({ on: garageSettings.requireOldPartProof }).from(garageSettings).where(eq(garageSettings.garageId, garageId)).limit(1)
  if (settings && settings.on === false) return []
  const rows = await db()
    .select({ description: jobItems.description })
    .from(jobItems)
    .where(and(eq(jobItems.garageId, garageId), eq(jobItems.jobId, jobId), eq(jobItems.type, "part"), inArray(jobItems.approvalStatus, ["approved", "pending"]), isNull(jobItems.oldPartProof)))
  return rows.map((r) => r.description)
}
