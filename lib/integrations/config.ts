import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { integrationProviders } from "@/lib/db/schema"
import { openJson } from "@/lib/crypto/secret-box"
import type { IntegrationCategory } from "./registry"

export type ActiveProvider = { provider: string; creds: Record<string, string> }

const TTL_MS = 60_000
const activeCache = new Map<IntegrationCategory, { at: number; value: ActiveProvider | null }>()
const byNameCache = new Map<string, { at: number; value: ActiveProvider | null }>()

/**
 * The provider an admin switched on for a category, with decrypted credentials.
 * null → no admin choice, so the env-var setup applies. Cached a minute per instance.
 */
export async function activeProvider(category: IntegrationCategory): Promise<ActiveProvider | null> {
  const hit = activeCache.get(category)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  let value: ActiveProvider | null = null
  try {
    const [row] = await db()
      .select()
      .from(integrationProviders)
      .where(and(eq(integrationProviders.category, category), eq(integrationProviders.isActive, true)))
      .limit(1)
    if (row) value = { provider: row.provider, creds: openJson(row.credentialsEncrypted) }
  } catch (e) {
    console.warn(`[integrations] ${category} settings unavailable, using env:`, (e as Error).message)
  }
  activeCache.set(category, { at: Date.now(), value })
  return value
}

/** A saved provider's credentials even if it is not the active one (verify old payments). */
export async function savedProvider(category: IntegrationCategory, provider: string): Promise<ActiveProvider | null> {
  const key = `${category}:${provider}`
  const hit = byNameCache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  let value: ActiveProvider | null = null
  try {
    const [row] = await db()
      .select()
      .from(integrationProviders)
      .where(and(eq(integrationProviders.category, category), eq(integrationProviders.provider, provider)))
      .limit(1)
    if (row) value = { provider: row.provider, creds: openJson(row.credentialsEncrypted) }
  } catch {
    value = null
  }
  byNameCache.set(key, { at: Date.now(), value })
  return value
}

export function clearIntegrationCache() {
  activeCache.clear()
  byNameCache.clear()
}
