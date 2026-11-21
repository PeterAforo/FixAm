"use server"
import { z } from "zod"
import { and, desc, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  cashUps,
  expenseCategories,
  expenses,
  payments,
  refunds,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { storageProvider } from "@/lib/integrations/storage"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const DEFAULT_CATEGORIES = [
  "Fuel", "Parts", "Salaries & wages", "Rent", "Utilities", "Maintenance & repairs",
  "Marketing", "Tools & equipment", "Licences & permits", "Bank charges", "Other",
]

/** Idempotent default category set for a garage. */
async function ensureExpenseCategories(garageId: string) {
  const existing = await db().select({ id: expenseCategories.id }).from(expenseCategories)
    .where(eq(expenseCategories.garageId, garageId)).limit(1)
  if (existing.length > 0) return
  await db().insert(expenseCategories).values(
    DEFAULT_CATEGORIES.map((name) => ({ garageId, name, isDefault: true }))
  )
}

export async function listExpenseData(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), from: z.string().optional(), to: z.string().optional() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || (!can(ctx.principal, "expenses.manage") && !can(ctx.principal, "reports.view_branch") && !can(ctx.principal, "reports.view_all"))) {
    return { ok: false as const }
  }
  await ensureExpenseCategories(d.garageId)

  const from = d.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const to = d.to ?? new Date().toISOString().slice(0, 10)

  const [cats, exps, ups, branchRows] = await Promise.all([
    db().select().from(expenseCategories).where(eq(expenseCategories.garageId, d.garageId)).orderBy(expenseCategories.name),
    db().select({
      id: expenses.id, description: expenses.description, amount: expenses.amount,
      paidOn: expenses.paidOn, method: expenses.method, vendorName: expenses.vendorName,
      categoryName: expenseCategories.name, branchName: branches.name, receiptPath: expenses.receiptPath,
    })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .leftJoin(branches, eq(expenses.branchId, branches.id))
      .where(and(eq(expenses.garageId, d.garageId), gte(expenses.paidOn, from), lt(expenses.paidOn, sql`${to}::date + 1`)))
      .orderBy(desc(expenses.paidOn))
      .limit(300),
    db().select().from(cashUps)
      .where(and(eq(cashUps.garageId, d.garageId), gte(cashUps.businessDate, from), lt(cashUps.businessDate, sql`${to}::date + 1`)))
      .orderBy(desc(cashUps.businessDate))
      .limit(60),
    db().select({ id: branches.id, name: branches.name }).from(branches)
      .where(and(eq(branches.garageId, d.garageId), sql`${branches.deletedAt} IS NULL`)),
  ])

  return {
    ok: true as const,
    data: {
      categories: cats.map((c) => ({ id: c.id, name: c.name })),
      expenses: exps.map((e) => ({
        id: e.id, description: e.description, amount: Number(e.amount),
        paidOn: e.paidOn, method: e.method, vendorName: e.vendorName,
        categoryName: e.categoryName, branchName: e.branchName, receiptPath: e.receiptPath,
      })),
      cashUps: ups.map((u) => ({
        id: u.id, branchId: u.branchId, businessDate: u.businessDate,
        expectedCash: Number(u.expectedCash), countedCash: Number(u.countedCash),
        difference: Number(u.difference), notes: u.notes,
      })),
      branches: branchRows,
      from, to,
    },
  }
}

export async function recordExpense(formData: FormData): Promise<ActionResult<{ expenseId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const garageId = String(formData.get("garageId") ?? "")
  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "expenses.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const parsed = z.object({
    branchId: z.string().uuid().optional(),
    categoryId: z.string().uuid(),
    description: z.string().min(2).max(300),
    amount: z.number().positive(),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(["cash", "momo", "card", "bank_transfer", "cheque", "other"]).optional(),
    vendorName: z.string().max(200).optional(),
  }).safeParse({
    branchId: formData.get("branchId") || undefined,
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    amount: parseFloat(String(formData.get("amount") ?? "0")),
    paidOn: formData.get("paidOn"),
    method: formData.get("method") || undefined,
    vendorName: formData.get("vendorName") || undefined,
  })
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const file = formData.get("receipt")
  let receiptPath: string | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: { code: "VALIDATION", message: "Receipt must be under 8MB" } }
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg"
    const key = `${garageId}/expenses/${uuidv7()}.${ext}`
    await storageProvider().put(key, Buffer.from(await file.arrayBuffer()), file.type || undefined)
    receiptPath = key
  }

  const [cat] = await db().select({ id: expenseCategories.id }).from(expenseCategories)
    .where(and(eq(expenseCategories.id, d.categoryId), eq(expenseCategories.garageId, garageId))).limit(1)
  if (!cat) return { ok: false, error: { code: "VALIDATION", message: "Invalid category" } }

  const expenseId = uuidv7()
  await db().insert(expenses).values({
    id: expenseId,
    garageId,
    branchId: d.branchId ?? ctx.membership.branchId,
    categoryId: d.categoryId,
    description: d.description,
    amount: BigInt(Math.round(d.amount * 100)),
    paidOn: d.paidOn,
    method: d.method ?? null,
    vendorName: d.vendorName ?? null,
    receiptPath,
    recordedBy: userId,
  })

  await writeAuditLog({
    garageId, actorUserId: userId, action: "expense.record",
    entityType: "expense", entityId: expenseId,
    after: { amount: d.amount, categoryId: d.categoryId, paidOn: d.paidOn },
  })
  return { ok: true, data: { expenseId } }
}

// ---------------------------------------------------------------------------
// Cash-up
// ---------------------------------------------------------------------------

export async function performCashUp(rawInput: unknown): Promise<ActionResult<{ cashUpId: string; difference: number }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    countedCash: z.number().int().min(0), // pesewas
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "cash_up.perform")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  // expected takings for the business date, grouped by method
  const dayStart = new Date(`${d.businessDate}T00:00:00Z`)
  const dayEnd = new Date(dayStart.getTime() + 86400_000)
  const rows = await db()
    .select({ method: payments.method, total: sql<string>`coalesce(sum(${payments.amount}),0)` })
    .from(payments)
    .where(and(
      eq(payments.garageId, d.garageId),
      eq(payments.branchId, d.branchId),
      eq(payments.status, "succeeded"),
      gte(payments.paidAt, dayStart),
      lt(payments.paidAt, dayEnd),
    ))
    .groupBy(payments.method)

  // cash refunds reduce expected takings
  const refundRows = await db()
    .select({ method: refunds.method, total: sql<string>`coalesce(sum(${refunds.amount}),0)` })
    .from(refunds)
    .innerJoin(payments, eq(refunds.paymentId, payments.id))
    .where(and(
      eq(refunds.garageId, d.garageId),
      eq(payments.branchId, d.branchId),
      gte(refunds.createdAt, dayStart),
      lt(refunds.createdAt, dayEnd),
    ))
    .groupBy(refunds.method)

  const byMethod: Record<string, number> = {}
  let expectedCash = 0
  for (const r of rows) {
    const total = Number(r.total)
    byMethod[r.method] = (byMethod[r.method] ?? 0) + total
    if (r.method === "cash") expectedCash += total
  }
  for (const r of refundRows) {
    const total = Number(r.total)
    byMethod[r.method] = (byMethod[r.method] ?? 0) - total
    if (r.method === "cash") expectedCash -= total
  }
  // cash expenses reduce expected cash
  const cashExpenses = await db()
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}),0)` })
    .from(expenses)
    .where(and(
      eq(expenses.garageId, d.garageId),
      eq(expenses.branchId, d.branchId),
      eq(expenses.paidOn, d.businessDate),
      eq(expenses.method, "cash"),
    ))
  const expTotal = Number(cashExpenses[0]?.total ?? 0)
  const expected = expectedCash - expTotal

  const [existing] = await db().select({ id: cashUps.id }).from(cashUps)
    .where(and(eq(cashUps.garageId, d.garageId), eq(cashUps.branchId, d.branchId), eq(cashUps.businessDate, d.businessDate))).limit(1)
  if (existing) return { ok: false, error: { code: "CONFLICT", message: "Cash-up already done for this date" } }

  const difference = BigInt(d.countedCash) - BigInt(expected)
  const cashUpId = uuidv7()
  await db().insert(cashUps).values({
    id: cashUpId,
    garageId: d.garageId,
    branchId: d.branchId,
    businessDate: d.businessDate,
    expectedCash: BigInt(expected),
    countedCash: BigInt(d.countedCash),
    difference,
    expectedByMethod: byMethod,
    notes: d.notes ?? null,
    performedBy: userId,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "cash_up.perform",
    entityType: "cash_up", entityId: cashUpId,
    after: { businessDate: d.businessDate, expected, counted: d.countedCash, difference: Number(difference) },
  })
  return { ok: true, data: { cashUpId, difference: Number(difference) } }
}
