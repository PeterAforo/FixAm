"use server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { integrationProviders, users } from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { openJson, sealJson } from "@/lib/crypto/secret-box"
import { clearIntegrationCache } from "@/lib/integrations/config"
import { PROVIDERS, providerDef, type IntegrationCategory } from "@/lib/integrations/registry"

async function adminId(): Promise<string | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const [u] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.a ? userId : null
}
const forbidden = { ok: false as const, error: { code: "FORBIDDEN" as const, message: "Platform admin only" } }

export type IntegrationView = {
  category: IntegrationCategory
  provider: string
  configured: boolean
  isActive: boolean
  /** Non-secret values as saved; secrets shown only as "set". */
  values: Record<string, string>
  secretsSet: string[]
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastTestMessage: string | null
}

/** Env fallback per category, so the page can say what runs when nothing is switched on. */
function envSummary(): Record<IntegrationCategory, string> {
  const pay = process.env.PAYMENT_PROVIDER ?? "mock"
  const sms = process.env.MESSAGING_SMS_PROVIDER ?? "mock"
  return {
    payments: pay === "mock" ? "Test mode (no real payments)" : `${pay} (server settings)`,
    sms: sms === "mock" ? "Test mode (messages are not sent)" : `${sms} (server settings)`,
  }
}

export async function adminListIntegrations(): Promise<ActionResult<{ items: IntegrationView[]; env: Record<IntegrationCategory, string> }>> {
  if (!(await adminId())) return forbidden
  const rows = await db().select().from(integrationProviders)
  const items = PROVIDERS.map((def): IntegrationView => {
    const row = rows.find((r) => r.category === def.category && r.provider === def.provider)
    const creds = openJson(row?.credentialsEncrypted)
    const values: Record<string, string> = {}
    const secretsSet: string[] = []
    for (const f of def.fields) {
      if (f.secret) {
        if (creds[f.key]) secretsSet.push(f.key)
      } else if (creds[f.key] !== undefined) values[f.key] = creds[f.key]!
    }
    return {
      category: def.category,
      provider: def.provider,
      configured: !!row,
      isActive: row?.isActive ?? false,
      values,
      secretsSet,
      lastTestAt: row?.lastTestAt ? row.lastTestAt.toISOString() : null,
      lastTestOk: row?.lastTestOk ?? null,
      lastTestMessage: row?.lastTestMessage ?? null,
    }
  })
  return { ok: true, data: { items, env: envSummary() } }
}

/** Save a provider's settings. A secret left blank keeps the one already saved. */
export async function adminSaveIntegration(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await adminId()
  if (!userId) return forbidden
  const parsed = z
    .object({ category: z.enum(["payments", "sms"]), provider: z.string().min(2).max(40), values: z.record(z.string(), z.string().max(4000)) })
    .safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { category, provider, values } = parsed.data
  const def = providerDef(category, provider)
  if (!def) return { ok: false, error: { code: "NOT_FOUND", message: "Unknown provider" } }

  const [row] = await db().select().from(integrationProviders)
    .where(and(eq(integrationProviders.category, category), eq(integrationProviders.provider, provider))).limit(1)
  const current = openJson(row?.credentialsEncrypted)
  const next: Record<string, string> = {}
  for (const f of def.fields) {
    const incoming = (values[f.key] ?? "").trim()
    if (f.secret && !incoming && current[f.key]) next[f.key] = current[f.key]!
    else if (incoming) next[f.key] = incoming
  }
  const missing = def.fields.filter((f) => f.required && !next[f.key]).map((f) => f.label)
  if (missing.length) return { ok: false, error: { code: "VALIDATION", message: `Fill in: ${missing.join(", ")}` } }
  if (provider === "custom_http" && !/^https:\/\//i.test(next.url ?? "")) {
    return { ok: false, error: { code: "VALIDATION", message: "The send URL must start with https://" } }
  }

  const now = new Date()
  await db()
    .insert(integrationProviders)
    .values({ category, provider, label: def.name, credentialsEncrypted: sealJson(next), updatedBy: userId, updatedAt: now })
    .onConflictDoUpdate({
      target: [integrationProviders.category, integrationProviders.provider],
      set: { credentialsEncrypted: sealJson(next), updatedBy: userId, updatedAt: now },
    })
  clearIntegrationCache()
  await writeAuditLog({
    garageId: null, actorUserId: userId, action: "integration.save", entityType: "integration_provider", entityId: null,
    // Field names only — never the values.
    after: { category, provider, fields: Object.keys(next) },
  })
  return { ok: true, data: { ok: true as const } }
}

/** Switch a saved provider on (the others in its category go off) or off (env settings apply again). */
export async function adminSetIntegrationActive(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await adminId()
  if (!userId) return forbidden
  const parsed = z.object({ category: z.enum(["payments", "sms"]), provider: z.string(), active: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { category, provider, active } = parsed.data
  const [row] = await db().select().from(integrationProviders)
    .where(and(eq(integrationProviders.category, category), eq(integrationProviders.provider, provider))).limit(1)
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Save the settings first" } }
  const now = new Date()
  if (active) {
    await db().update(integrationProviders).set({ isActive: false, updatedAt: now }).where(eq(integrationProviders.category, category))
  }
  await db().update(integrationProviders).set({ isActive: active, updatedBy: userId, updatedAt: now }).where(eq(integrationProviders.id, row.id))
  clearIntegrationCache()
  await writeAuditLog({
    garageId: null, actorUserId: userId, action: active ? "integration.activate" : "integration.deactivate",
    entityType: "integration_provider", entityId: row.id, after: { category, provider },
  })
  return { ok: true, data: { ok: true as const } }
}

/** Delete a saved provider (not allowed while it is switched on). */
export async function adminRemoveIntegration(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await adminId()
  if (!userId) return forbidden
  const parsed = z.object({ category: z.enum(["payments", "sms"]), provider: z.string() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const [row] = await db().select().from(integrationProviders)
    .where(and(eq(integrationProviders.category, parsed.data.category), eq(integrationProviders.provider, parsed.data.provider))).limit(1)
  if (!row) return { ok: true, data: { ok: true as const } }
  if (row.isActive) return { ok: false, error: { code: "CONFLICT", message: "Switch it off first" } }
  await db().delete(integrationProviders).where(eq(integrationProviders.id, row.id))
  clearIntegrationCache()
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "integration.remove", entityType: "integration_provider", entityId: row.id, after: parsed.data })
  return { ok: true, data: { ok: true as const } }
}

/** Send a test SMS through a saved provider (active or not) and record the result. */
export async function adminTestSmsProvider(raw: unknown): Promise<ActionResult<{ message: string }>> {
  const userId = await adminId()
  if (!userId) return forbidden
  const parsed = z
    .object({ provider: z.string(), phone: z.string().trim().regex(/^(?:\+?233|0)\d{9}$/, "Enter a Ghana mobile number") })
    .safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input" } }
  const [row] = await db().select().from(integrationProviders)
    .where(and(eq(integrationProviders.category, "sms"), eq(integrationProviders.provider, parsed.data.provider))).limit(1)
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Save the settings first" } }
  const { smsAdapter } = await import("@/lib/integrations")
  const adapter = smsAdapter(row.provider, openJson(row.credentialsEncrypted))
  if (!adapter) return { ok: false, error: { code: "NOT_FOUND", message: "Unknown SMS provider" } }
  const digits = parsed.data.phone.replace(/\D/g, "")
  const to = digits.startsWith("233") ? digits : `233${digits.slice(1)}`
  let ok = true
  let message = "Test SMS sent. Check the phone."
  try {
    await adapter.send({
      channel: "sms",
      to,
      templateKey: "integration_test",
      variables: {},
      rendered: { body: "FixAm: this is a test message from your SMS settings." },
      idempotencyKey: `integration-test:${row.provider}:${Date.now()}`,
    })
  } catch (e) {
    ok = false
    message = (e as Error).message.slice(0, 300)
  }
  await db().update(integrationProviders).set({ lastTestAt: new Date(), lastTestOk: ok, lastTestMessage: message }).where(eq(integrationProviders.id, row.id))
  return ok ? { ok: true, data: { message } } : { ok: false, error: { code: "INTERNAL", message } }
}
