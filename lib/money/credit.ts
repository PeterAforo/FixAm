"use server"
import { z } from "zod"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  creditAccounts,
  creditStatements,
  customers,
  dueItems,
  invoices,
  payments,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { applyPaymentToInvoice } from "./payments-core"
import { nextDocNumber } from "./sequence"
import { sendPaymentReceipt } from "./payments"
import { ageingBuckets } from "@/lib/domain/credit"
import { randomBytes } from "crypto"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Open / manage credit accounts
// ---------------------------------------------------------------------------

export async function openCreditAccount(rawInput: unknown): Promise<ActionResult<{ accountId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    customerId: z.string().uuid(),
    creditLimit: z.number().int().positive(), // pesewas
    paymentTermsDays: z.number().int().min(0).max(365).default(30),
    statementDay: z.number().int().min(1).max(28).default(1),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "credit_accounts.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [cust] = await db().select({ id: customers.id }).from(customers)
    .where(and(eq(customers.id, d.customerId), eq(customers.garageId, d.garageId))).limit(1)
  if (!cust) return { ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } }

  const [existing] = await db().select({ id: creditAccounts.id, status: creditAccounts.status }).from(creditAccounts)
    .where(and(eq(creditAccounts.garageId, d.garageId), eq(creditAccounts.customerId, d.customerId))).limit(1)
  if (existing) {
    if (existing.status === "closed") {
      await db().update(creditAccounts).set({
        status: "active", creditLimit: BigInt(d.creditLimit),
        paymentTermsDays: d.paymentTermsDays, statementDay: d.statementDay, updatedAt: new Date(),
      }).where(eq(creditAccounts.id, existing.id))
      return { ok: true, data: { accountId: existing.id } }
    }
    return { ok: false, error: { code: "CONFLICT", message: "Customer already has a credit account" } }
  }

  const accountId = uuidv7()
  await db().insert(creditAccounts).values({
    id: accountId,
    garageId: d.garageId,
    customerId: d.customerId,
    creditLimit: BigInt(d.creditLimit),
    paymentTermsDays: d.paymentTermsDays,
    statementDay: d.statementDay,
    status: "active",
    approvedBy: userId,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "credit_account.open",
    entityType: "credit_account", entityId: accountId,
    after: { customerId: d.customerId, creditLimit: d.creditLimit, termsDays: d.paymentTermsDays },
  })
  return { ok: true, data: { accountId } }
}

// ---------------------------------------------------------------------------
// Charge an issued invoice to a credit account
// ---------------------------------------------------------------------------

export async function chargeInvoiceToCredit(rawInput: unknown): Promise<ActionResult<{ paymentId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    creditAccountId: z.string().uuid(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "credit_accounts.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv) return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } }
  if (!["issued", "partially_paid"].includes(inv.status) || Number(inv.balanceDue) <= 0) {
    return { ok: false, error: { code: "VALIDATION", message: "Invoice not chargeable" } }
  }
  if (inv.customerId == null) return { ok: false, error: { code: "VALIDATION", message: "Invoice needs a customer" } }

  const [acct] = await db().select().from(creditAccounts)
    .where(and(eq(creditAccounts.id, d.creditAccountId), eq(creditAccounts.garageId, d.garageId))).limit(1)
  if (!acct || acct.status !== "active") return { ok: false, error: { code: "NOT_FOUND", message: "Credit account not active" } }
  if (acct.customerId !== inv.customerId) {
    return { ok: false, error: { code: "VALIDATION", message: "Credit account belongs to a different customer" } }
  }

  // limit check — owner override audited
  const projected = acct.balance + inv.balanceDue
  const exceeds = projected > acct.creditLimit
  if (exceeds && !can(ctx.principal, "credit_accounts.exceed_limit")) {
    return { ok: false, error: { code: "FORBIDDEN", message: `Exceeds credit limit (balance ${Number(acct.balance) / 100} + ${Number(inv.balanceDue) / 100} > limit ${Number(acct.creditLimit) / 100})` } }
  }

  let branchId = inv.branchId ?? ctx.membership.branchId
  if (!branchId) {
    const [def] = await db().select({ id: branches.id }).from(branches)
      .where(and(eq(branches.garageId, d.garageId), eq(branches.isDefault, true))).limit(1)
    branchId = def?.id ?? null
  }
  if (!branchId) return { ok: false, error: { code: "VALIDATION", message: "Garage has no branch" } }

  const paymentId = uuidv7()
  await db().insert(payments).values({
    id: paymentId,
    garageId: d.garageId,
    branchId,
    customerId: inv.customerId,
    invoiceId: inv.id,
    creditAccountId: acct.id,
    method: "credit_account",
    status: "succeeded",
    amount: inv.balanceDue,
    receivedBy: userId,
    paidAt: new Date(),
    externalReference: randomBytes(24).toString("hex"),
    notes: "Charged to credit account",
  })

  await applyPaymentToInvoice(db(), {
    garageId: d.garageId, paymentId, invoiceId: inv.id, amountPesewas: inv.balanceDue,
  })
  await db().update(creditAccounts).set({
    balance: acct.balance + inv.balanceDue, updatedAt: new Date(),
  }).where(eq(creditAccounts.id, acct.id))
  await db().update(invoices).set({ creditAccountId: acct.id, updatedAt: new Date() }).where(eq(invoices.id, inv.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId,
    action: exceeds ? "credit_account.charge_limit_override" : "credit_account.charge",
    entityType: "credit_account", entityId: acct.id,
    after: { invoiceId: inv.id, amount: Number(inv.balanceDue), limitExceeded: exceeds },
  })
  return { ok: true, data: { paymentId } }
}

// ---------------------------------------------------------------------------
// Payment against a credit account, allocated across invoices
// ---------------------------------------------------------------------------

export async function creditAccountPayment(rawInput: unknown): Promise<ActionResult<{ paymentId: string; receiptNumber: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const allocSchema = z.object({ invoiceId: z.string().uuid(), amount: z.number().int().positive() })
  const parsed = z.object({
    garageId: z.string().uuid(),
    creditAccountId: z.string().uuid(),
    method: z.enum(["cash", "momo", "card", "bank_transfer", "cheque", "other"]),
    amount: z.number().int().positive(), // pesewas — must equal sum(allocations)
    allocations: z.array(allocSchema).min(1).max(50),
    payerPhone: z.string().max(20).optional(),
    momoNetwork: z.enum(["mtn", "telecel", "airteltigo"]).optional(),
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payments.record")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [acct] = await db().select().from(creditAccounts)
    .where(and(eq(creditAccounts.id, d.creditAccountId), eq(creditAccounts.garageId, d.garageId))).limit(1)
  if (!acct || acct.status !== "active") return { ok: false, error: { code: "NOT_FOUND", message: "Credit account not found" } }

  const sum = d.allocations.reduce((s, a) => s + a.amount, 0)
  if (sum !== d.amount) return { ok: false, error: { code: "VALIDATION", message: "Allocations must sum to the payment amount" } }

  // validate each invoice belongs to the account customer and has balance
  for (const a of d.allocations) {
    const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, a.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
    if (!inv || inv.customerId !== acct.customerId) {
      return { ok: false, error: { code: "VALIDATION", message: "Allocation targets an invalid invoice" } }
    }
    if (BigInt(a.amount) > inv.balanceDue) {
      return { ok: false, error: { code: "VALIDATION", message: `Allocation exceeds balance on ${inv.number ?? "invoice"}` } }
    }
  }

  let branchId = ctx.membership.branchId
  if (!branchId) {
    const [def] = await db().select({ id: branches.id }).from(branches)
      .where(and(eq(branches.garageId, d.garageId), eq(branches.isDefault, true))).limit(1)
    branchId = def?.id ?? null
  }
  if (!branchId) return { ok: false, error: { code: "VALIDATION", message: "Garage has no branch" } }
  const receiptNumber = await nextDocNumber(d.garageId, branchId, "RCT", "RCT")
  const receiptToken = randomBytes(24).toString("hex")

  const paymentId = uuidv7()
  await db().insert(payments).values({
    id: paymentId,
    garageId: d.garageId,
    branchId,
    customerId: acct.customerId,
    creditAccountId: acct.id,
    method: d.method,
    status: "succeeded",
    amount: BigInt(d.amount),
    momoNetwork: d.momoNetwork ?? null,
    payerPhone: d.payerPhone ?? null,
    receivedBy: userId,
    paidAt: new Date(),
    receiptNumber,
    externalReference: receiptToken,
    notes: d.notes ?? "Credit account payment",
  })

  for (const a of d.allocations) {
    // applyPaymentToInvoice creates the payment_allocations row itself
    await applyPaymentToInvoice(db(), {
      garageId: d.garageId, paymentId, invoiceId: a.invoiceId, amountPesewas: BigInt(a.amount),
    })
  }

  const newBalance = acct.balance - BigInt(d.amount)
  await db().update(creditAccounts).set({
    balance: newBalance < 0n ? 0n : newBalance, updatedAt: new Date(),
  }).where(eq(creditAccounts.id, acct.id))

  // auto-complete open credit_statement due items once the balance is cleared
  if (newBalance <= 0n) {
    try {
      await db().update(dueItems).set({
        status: "completed", completedAt: new Date(), updatedAt: new Date(),
      }).where(and(
        eq(dueItems.garageId, d.garageId),
        eq(dueItems.customerId, acct.customerId),
        eq(dueItems.type, "credit_statement"),
        inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"]),
      ))
    } catch (e) {
      console.error("[credit] due-item completion failed", e)
    }
  }

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "credit_account.payment",
    entityType: "credit_account", entityId: acct.id,
    after: { paymentId, amount: d.amount, allocations: d.allocations.length },
  })
  await sendPaymentReceipt(paymentId)
  return { ok: true, data: { paymentId, receiptNumber } }
}

// ---------------------------------------------------------------------------
// Account page data
// ---------------------------------------------------------------------------

export async function getCreditAccount(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), accountId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "credit_accounts.manage") && !can(ctx.principal, "invoices.view")) {
    return { ok: false as const }
  }

  const [acct] = await db().select().from(creditAccounts)
    .where(and(eq(creditAccounts.id, d.accountId), eq(creditAccounts.garageId, d.garageId))).limit(1)
  if (!acct) return { ok: false as const }

  const [cust] = await db().select({ fullName: customers.fullName, phone: customers.phone }).from(customers)
    .where(eq(customers.id, acct.customerId)).limit(1)

  const openInvoices = await db()
    .select({
      id: invoices.id, number: invoices.number, status: invoices.status,
      balanceDue: invoices.balanceDue, dueDate: invoices.dueDate,
      issueDate: invoices.issueDate, createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(
      eq(invoices.garageId, d.garageId),
      eq(invoices.customerId, acct.customerId),
      eq(invoices.creditAccountId, acct.id),
      inArray(invoices.status, ["issued", "partially_paid"]),
    ))
    .orderBy(desc(invoices.createdAt))

  const statements = await db().select().from(creditStatements)
    .where(and(eq(creditStatements.creditAccountId, acct.id), eq(creditStatements.garageId, d.garageId)))
    .orderBy(desc(creditStatements.periodEnd))
    .limit(12)

  const today = todayISO()
  const ageing = ageingBuckets(
    openInvoices.map((i) => ({
      balanceDue: Number(i.balanceDue),
      dueDate: i.dueDate,
      issueDate: i.issueDate,
      createdAt: i.createdAt.toISOString(),
    })),
    today
  )

  return {
    ok: true as const,
    data: {
      account: {
        id: acct.id,
        customerId: acct.customerId,
        creditLimit: Number(acct.creditLimit),
        balance: Number(acct.balance),
        paymentTermsDays: acct.paymentTermsDays,
        statementDay: acct.statementDay,
        status: acct.status,
      },
      customer: cust ?? null,
      openInvoices: openInvoices.map((i) => ({
        id: i.id, number: i.number, status: i.status,
        balanceDue: Number(i.balanceDue), dueDate: i.dueDate, issueDate: i.issueDate,
      })),
      ageing,
      statements: statements.map((s) => ({
        id: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd,
        closingBalance: Number(s.closingBalance), sentAt: s.sentAt?.toISOString() ?? null,
      })),
    },
  }
}

export async function listCreditAccounts(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false as const }

  const rows = await db()
    .select({
      id: creditAccounts.id,
      customerName: customers.fullName,
      creditLimit: creditAccounts.creditLimit,
      balance: creditAccounts.balance,
      status: creditAccounts.status,
      paymentTermsDays: creditAccounts.paymentTermsDays,
      statementDay: creditAccounts.statementDay,
    })
    .from(creditAccounts)
    .innerJoin(customers, eq(creditAccounts.customerId, customers.id))
    .where(and(eq(creditAccounts.garageId, d.garageId), eq(creditAccounts.status, "active")))
    .orderBy(desc(creditAccounts.balance))

  return { ok: true as const, data: rows.map((r) => ({ ...r, creditLimit: Number(r.creditLimit), balance: Number(r.balance) })) }
}
