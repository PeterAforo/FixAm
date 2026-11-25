import "server-only"
import { db } from "@/lib/db"
import { platformSettings } from "@/lib/db/schema"

/**
 * Admin-editable platform settings (/admin/plans → "Fees & free places").
 * Rates are basis points: 600 = 6%.
 */
export type PlatformSettings = {
  vendorCommissionBp: number
  vendorProCommissionBp: number
  towCommissionBp: number
  riderCommissionBp: number
  brokerFreeQuotesPerMonth: number
  freeGaragePlaces: number
}

export const SETTING_KEYS: Record<keyof PlatformSettings, string> = {
  vendorCommissionBp: "vendor_commission_bp",
  vendorProCommissionBp: "vendor_pro_commission_bp",
  towCommissionBp: "tow_commission_bp",
  riderCommissionBp: "rider_commission_bp",
  brokerFreeQuotesPerMonth: "broker_free_quotes_per_month",
  freeGaragePlaces: "free_garage_places",
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  vendorCommissionBp: 600,
  vendorProCommissionBp: 300,
  towCommissionBp: 1000,
  riderCommissionBp: 1000,
  brokerFreeQuotesPerMonth: 5,
  freeGaragePlaces: 10,
}

const TTL_MS = 60_000
let cache: { at: number; value: PlatformSettings } | null = null

/** Current settings (DB over defaults), cached for a minute per server instance. */
export async function platformSettingsNow(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const value: PlatformSettings = { ...DEFAULT_SETTINGS }
  try {
    const rows = await db().select().from(platformSettings)
    const byKey = new Map(rows.map((r) => [r.key, r.value]))
    for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof PlatformSettings, string][]) {
      const n = Number(byKey.get(key))
      if (byKey.has(key) && Number.isFinite(n) && n >= 0) value[field] = Math.round(n)
    }
  } catch (e) {
    console.warn("[settings] using defaults:", (e as Error).message)
  }
  cache = { at: Date.now(), value }
  return value
}

export function clearPlatformSettingsCache() {
  cache = null
}

/** commission = amount × bp / 10000, rounded down to the pesewa. */
export function applyBp(amount: bigint, bp: number): bigint {
  return (amount * BigInt(Math.max(0, Math.round(bp)))) / 10000n
}
