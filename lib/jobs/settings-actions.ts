"use server"

import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageSettings } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog } from "@/lib/actions"

/** Workshop rules (P8-07): require old-part proof before invoicing. */
export async function saveWorkshopRules(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ garageId: z.string().uuid(), requireOldPartProof: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const m = await resolveMembership(userId, parsed.data.garageId)
  if (!m || !can({ kind: "staff", role: m.role, garageId: parsed.data.garageId, branchId: m.branchId }, "garage.settings.manage")) return { ok: false, error: "No permission" }
  await db()
    .insert(garageSettings)
    .values({ garageId: parsed.data.garageId, requireOldPartProof: parsed.data.requireOldPartProof })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: { requireOldPartProof: parsed.data.requireOldPartProof, updatedAt: new Date() } })
  await writeAuditLog({ garageId: parsed.data.garageId, actorUserId: userId, action: "garage.workshop_rules.update", entityType: "garage", entityId: parsed.data.garageId, after: parsed.data }).catch(() => undefined)
  return { ok: true }
}

export async function getWorkshopRules(garageId: string) {
  const [r] = await db().select({ requireOldPartProof: garageSettings.requireOldPartProof }).from(garageSettings).where(eq(garageSettings.garageId, garageId)).limit(1)
  return { requireOldPartProof: r?.requireOldPartProof ?? true }
}
