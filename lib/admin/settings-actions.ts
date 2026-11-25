"use server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformSettings, users } from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { clearPlatformSettingsCache, platformSettingsNow, SETTING_KEYS, type PlatformSettings } from "@/lib/platform/settings"

async function adminId(): Promise<string | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const [u] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.a ? userId : null
}

export async function adminGetPlatformSettings(): Promise<ActionResult<PlatformSettings>> {
  if (!(await adminId())) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  clearPlatformSettingsCache()
  return { ok: true, data: await platformSettingsNow() }
}

const pct = z.number().min(0).max(50) // percent, entered as 6 or 6.5

/** Save fees (entered as percentages) and allowances. */
export async function adminSavePlatformSettings(raw: unknown): Promise<ActionResult<PlatformSettings>> {
  const userId = await adminId()
  if (!userId) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = z
    .object({
      vendorCommissionPct: pct,
      vendorProCommissionPct: pct,
      towCommissionPct: pct,
      riderCommissionPct: pct,
      brokerFreeQuotesPerMonth: z.number().int().min(0).max(1000),
      freeGaragePlaces: z.number().int().min(0).max(10_000),
    })
    .safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the numbers — fees are 0–50%" } }
  const d = parsed.data
  const before = await platformSettingsNow()
  const next: PlatformSettings = {
    vendorCommissionBp: Math.round(d.vendorCommissionPct * 100),
    vendorProCommissionBp: Math.round(d.vendorProCommissionPct * 100),
    towCommissionBp: Math.round(d.towCommissionPct * 100),
    riderCommissionBp: Math.round(d.riderCommissionPct * 100),
    brokerFreeQuotesPerMonth: d.brokerFreeQuotesPerMonth,
    freeGaragePlaces: d.freeGaragePlaces,
  }
  const now = new Date()
  for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof PlatformSettings, string][]) {
    await db()
      .insert(platformSettings)
      .values({ key, value: next[field], updatedBy: userId, updatedAt: now })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: next[field], updatedBy: userId, updatedAt: now } })
  }
  clearPlatformSettingsCache()
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "platform.settings_update", entityType: "platform_settings", entityId: null, before, after: next })
  return { ok: true, data: next }
}
