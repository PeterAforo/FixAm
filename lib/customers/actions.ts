"use server"
import { z } from "zod"
import { and, eq, isNull, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers } from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { normalizeGhPhone } from "@/lib/phone"
import { can, type StaffRole } from "@/lib/auth/permissions"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const contactChannel = z.enum(["sms", "whatsapp", "email", "push"])

const customerInput = z.object({
  type: z.enum(["individual", "business", "fleet"]).default("individual"),
  fullName: z.string().max(120).optional().or(z.literal("")),
  companyName: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().min(1),
  altPhone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  whatsappOptIn: z.boolean().default(true),
  marketingOptIn: z.boolean().default(false),
  preferredChannels: z.array(contactChannel).max(4).default(["whatsapp", "sms"]),
  tags: z.array(z.string().max(40)).max(10).default([]),
  notes: z.string().max(2000).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
})

const createSchema = z.object({
  garageId: z.string().uuid(),
  customer: customerInput,
})

const updateSchema = createSchema.extend({
  customerId: z.string().uuid(),
})

function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" && v.trim() === "" ? null : v
  }
  return out as T
}

async function findByPhone(garageId: string, phone: string, excludeId?: string) {
  const rows = await db()
    .select({ id: customers.id, fullName: customers.fullName, companyName: customers.companyName })
    .from(customers)
    .where(
      and(
        eq(customers.garageId, garageId),
        eq(customers.phone, phone),
        isNull(customers.deletedAt),
        excludeId ? ne(customers.id, excludeId) : undefined
      )
    )
    .limit(1)
  return rows[0] ?? null
}

/** Create a customer. Returns CONFLICT with the existing record when the phone is taken. */
export async function createCustomer(rawInput: unknown): Promise<
  ActionResult<{ customerId: string; duplicate?: { id: string; name: string } }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = createSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const { garageId, customer: c } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "customers.create")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't add customers" } }
  }

  const phone = normalizeGhPhone(c.phone)
  const altPhone = c.altPhone ? normalizeGhPhone(c.altPhone) : null
  if (!phone) {
    return { ok: false, error: { code: "VALIDATION", message: "Enter a valid Ghana phone number", fieldErrors: { phone: ["Invalid Ghana phone number"] } } }
  }
  if (c.altPhone && !altPhone) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid alternate phone", fieldErrors: { altPhone: ["Invalid Ghana phone number"] } } }
  }

  const dup = await findByPhone(garageId, phone)
  if (dup) {
    return {
      ok: true,
      data: {
        customerId: dup.id,
        duplicate: { id: dup.id, name: dup.fullName || dup.companyName || phone },
      },
    }
  }

  const values = clean({
    garageId,
    type: c.type,
    fullName: (c.fullName || c.companyName || "").trim() || c.companyName || "Customer",
    companyName: c.type !== "individual" ? c.companyName || null : c.companyName || null,
    phone,
    altPhone,
    email: c.email || null,
    whatsappOptIn: c.whatsappOptIn,
    marketingOptIn: c.marketingOptIn,
    preferredChannels: (c.preferredChannels.length ? c.preferredChannels : ["whatsapp", "sms"]) as (
      | "sms"
      | "whatsapp"
      | "email"
      | "push"
    )[],
    tags: c.tags,
    notes: c.notes || null,
    address: c.address || null,
  })

  try {
    const [row] = await db().insert(customers).values(values).returning({ id: customers.id })
    await writeAuditLog({
      garageId,
      actorUserId: userId,
      action: "customer.create",
      entityType: "customer",
      entityId: row!.id,
      after: { phone, type: c.type },
    })
    return { ok: true, data: { customerId: row!.id } }
  } catch (e) {
    // Race-safe: unique (garage_id, phone) violation → treat as duplicate
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
      const again = await findByPhone(garageId, phone)
      if (again) {
        return { ok: true, data: { customerId: again.id, duplicate: { id: again.id, name: again.fullName || again.companyName || phone } } }
      }
    }
    throw e
  }
}

export async function updateCustomer(rawInput: unknown): Promise<
  ActionResult<{ customerId: string; duplicate?: { id: string; name: string } }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = updateSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const { garageId, customerId, customer: c } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "customers.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't edit customers" } }
  }

  const phone = normalizeGhPhone(c.phone)
  if (!phone) {
    return { ok: false, error: { code: "VALIDATION", message: "Enter a valid Ghana phone number", fieldErrors: { phone: ["Invalid Ghana phone number"] } } }
  }

  const dup = await findByPhone(garageId, phone, customerId)
  if (dup) {
    return {
      ok: true,
      data: { customerId: dup.id, duplicate: { id: dup.id, name: dup.fullName || dup.companyName || phone } },
    }
  }

  const before = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.garageId, garageId), isNull(customers.deletedAt)))
    .limit(1)
  if (!before[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } }

  const values = clean({
    type: c.type,
    fullName: (c.fullName || c.companyName || "").trim() || c.companyName || "Customer",
    companyName: c.companyName || null,
    phone,
    altPhone: c.altPhone ? normalizeGhPhone(c.altPhone) : null,
    email: c.email || null,
    whatsappOptIn: c.whatsappOptIn,
    marketingOptIn: c.marketingOptIn,
    preferredChannels: (c.preferredChannels.length ? c.preferredChannels : ["whatsapp", "sms"]) as (
      | "sms"
      | "whatsapp"
      | "email"
      | "push"
    )[],
    tags: c.tags,
    notes: c.notes || null,
    address: c.address || null,
    updatedAt: new Date(),
  })

  await db().update(customers).set(values).where(eq(customers.id, customerId))
  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "customer.update",
    entityType: "customer",
    entityId: customerId,
    before: { phone: before[0].phone, type: before[0].type },
    after: { phone, type: c.type },
  })
  return { ok: true, data: { customerId } }
}

/** Duplicate-phone probe used by the create form before submit. */
export async function findCustomerByPhone(rawInput: unknown): Promise<
  ActionResult<{ id: string; name: string; phone: string } | null>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid(), phone: z.string() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const phone = normalizeGhPhone(parsed.data.phone)
  if (!phone) return { ok: true, data: null }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "customers.view")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Not allowed" } }
  }
  const dup = await findByPhone(parsed.data.garageId, phone)
  return {
    ok: true,
    data: dup ? { id: dup.id, name: dup.fullName || dup.companyName || phone, phone } : null,
  }
}
