"use server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { jobTemplates } from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireManager(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  const principal = staffPrincipal(m.role, garageId, m.branchId)
  if (!can(principal, "garage.templates.manage")) return null
  return { membership: m, principal }
}

const defaultItem = z.object({
  type: z.enum(["part", "labour", "fee", "discount"]).default("labour"),
  description: z.string().min(1).max(300),
  quantity: z.number().positive().max(999).default(1),
  unitPricePesewas: z.number().int().min(0).default(0),
})

const checklistItem = z.object({
  label: z.string().min(1).max(200),
  required: z.boolean().default(false),
})

const templateInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  defaultItems: z.array(defaultItem).max(50).default([]),
  checklist: z.array(checklistItem).max(50).default([]),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional().nullable(),
  depositPercent: z.number().int().min(0).max(100).optional().nullable(),
  createsDueItemType: z
    .enum([
      "oil_change",
      "general_service",
      "insurance",
      "roadworthy",
      "registration_licence",
      "drivers_licence",
      "instalment",
      "credit_statement",
      "custom",
    ])
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
})

const createSchema = z.object({ garageId: z.string().uuid(), template: templateInput })
const updateSchema = createSchema.extend({ templateId: z.string().uuid() })

function toRow(t: z.infer<typeof templateInput>) {
  return {
    name: t.name.trim(),
    description: t.description || null,
    defaultItems: t.defaultItems.map((i) => ({
      type: i.type,
      description: i.description.trim(),
      quantity: i.quantity,
      unitPricePesewas: i.unitPricePesewas,
    })),
    checklist: t.checklist.map((c) => ({ label: c.label.trim(), required: c.required })),
    estimatedMinutes: t.estimatedMinutes ?? null,
    depositPercent: t.depositPercent ?? null,
    createsDueItemType: t.createsDueItemType ?? null,
    isActive: t.isActive,
  }
}

export async function createJobTemplate(rawInput: unknown): Promise<ActionResult<{ templateId: string }>> {
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
  const { garageId, template } = parsed.data

  const ctx = await requireManager(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Only owners and managers can manage templates" } }

  const [row] = await db()
    .insert(jobTemplates)
    .values({ garageId, ...toRow(template) })
    .returning({ id: jobTemplates.id })

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "job_template.create",
    entityType: "job_template",
    entityId: row!.id,
    after: { name: template.name },
  })
  return { ok: true, data: { templateId: row!.id } }
}

export async function updateJobTemplate(rawInput: unknown): Promise<ActionResult<{ templateId: string }>> {
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
  const { garageId, templateId, template } = parsed.data

  const ctx = await requireManager(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Only owners and managers can manage templates" } }

  const before = await db()
    .select({ id: jobTemplates.id, name: jobTemplates.name })
    .from(jobTemplates)
    .where(and(eq(jobTemplates.id, templateId), eq(jobTemplates.garageId, garageId)))
    .limit(1)
  if (!before[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Template not found" } }

  await db()
    .update(jobTemplates)
    .set({ ...toRow(template), updatedAt: new Date() })
    .where(eq(jobTemplates.id, templateId))

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "job_template.update",
    entityType: "job_template",
    entityId: templateId,
    before: { name: before[0].name },
    after: { name: template.name },
  })
  return { ok: true, data: { templateId } }
}

export async function setJobTemplateActive(rawInput: unknown): Promise<ActionResult<{ templateId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const schema = z.object({ garageId: z.string().uuid(), templateId: z.string().uuid(), isActive: z.boolean() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, templateId, isActive } = parsed.data

  const ctx = await requireManager(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Only owners and managers can manage templates" } }

  const res = await db()
    .update(jobTemplates)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(jobTemplates.id, templateId), eq(jobTemplates.garageId, garageId)))
    .returning({ id: jobTemplates.id })
  if (!res[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Template not found" } }

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: isActive ? "job_template.activate" : "job_template.deactivate",
    entityType: "job_template",
    entityId: templateId,
  })
  return { ok: true, data: { templateId } }
}

/** Active templates for pickers (check-in, estimate builder). Any staff viewer. */
export async function listActiveTemplates(rawInput: unknown): Promise<
  ActionResult<
    {
      id: string
      name: string
      description: string | null
      defaultItems: unknown
      checklist: unknown
      estimatedMinutes: number | null
      depositPercent: number | null
      createsDueItemType: string | null
    }[]
  >
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const m = await resolveMembership(userId, parsed.data.garageId)
  if (!m) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const rows = await db()
    .select({
      id: jobTemplates.id,
      name: jobTemplates.name,
      description: jobTemplates.description,
      defaultItems: jobTemplates.defaultItems,
      checklist: jobTemplates.checklist,
      estimatedMinutes: jobTemplates.estimatedMinutes,
      depositPercent: jobTemplates.depositPercent,
      createsDueItemType: jobTemplates.createsDueItemType,
    })
    .from(jobTemplates)
    .where(and(eq(jobTemplates.garageId, parsed.data.garageId), eq(jobTemplates.isActive, true)))
    .orderBy(jobTemplates.name)
  return { ok: true, data: rows }
}
