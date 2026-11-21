import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { documentSequences } from "@/lib/db/schema"

/**
 * Gapless per-(garage, branch, docType) document numbering.
 * INSERT ... ON CONFLICT DO UPDATE serializes concurrent issuers on the
 * sequence row, so two simultaneous issues get consecutive numbers.
 * Callers must pass a concrete branchId (never null) — resolve the garage
 * default branch first when the document has none.
 */
export async function nextDocNumber(
  garageId: string,
  branchId: string,
  docType: string,
  prefix: string
): Promise<string> {
  const rows = await db()
    .insert(documentSequences)
    .values({ garageId, branchId, docType, nextNumber: 2n })
    .onConflictDoUpdate({
      target: [documentSequences.garageId, documentSequences.branchId, documentSequences.docType],
      set: { nextNumber: sql`${documentSequences.nextNumber} + 1`, updatedAt: new Date() },
    })
    .returning({ nextNumber: documentSequences.nextNumber })
  return `${prefix}-${String(Number(rows[0]!.nextNumber) - 1).padStart(5, "0")}`
}
