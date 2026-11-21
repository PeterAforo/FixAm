import { and, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  creditAccounts,
  creditStatements,
  customers,
  dueItems,
  garages,
  invoices,
  payments,
  vehicles,
} from "@/lib/db/schema"
import { ageingBuckets, isStatementDay, statementPeriod } from "@/lib/domain/credit"
import { sendMessage } from "@/lib/messaging/send"
import { inngest } from "../client"
import { randomBytes, createHash, randomUUID } from "crypto"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const todayISO = () => new Date().toISOString().slice(0, 10)

/**
 * Daily sweep: on each credit account's statement_day, generate the monthly
 * statement (previous calendar month), create a credit_statement due item,
 * and message the customer.
 */
export const creditStatementSweep = inngest.createFunction(
  {
    id: "credit-statement-sweep",
    retries: 1,
    triggers: [{ cron: "20 1 * * *" }],
  },
  async ({ step }) => {
    const today = todayISO()
    const accounts = await step.run("list", async () =>
      db()
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.status, "active"))
    )

    const due = accounts.filter((a) => isStatementDay(a.statementDay, today))
    let generated = 0

    for (const acct of due) {
      const result = await step.run(`statement-${acct.id}`, async () => {
        const period = statementPeriod(acct.statementDay ?? 1, today)

        // idempotent: one statement per account per period
        const [existing] = await db().select({ id: creditStatements.id }).from(creditStatements)
          .where(and(
            eq(creditStatements.creditAccountId, acct.id),
            eq(creditStatements.periodStart, period.start),
            eq(creditStatements.periodEnd, period.end),
          )).limit(1)
        if (existing) return { skipped: true }

        const periodPayments = await db()
          .select({ method: payments.method, amount: payments.amount })
          .from(payments)
          .where(and(
            eq(payments.garageId, acct.garageId),
            eq(payments.creditAccountId, acct.id),
            eq(payments.status, "succeeded"),
            gte(payments.paidAt, new Date(`${period.start}T00:00:00Z`)),
            lt(payments.paidAt, new Date(`${period.end}T23:59:59Z`)),
          ))

        const charges = periodPayments.filter((p) => p.method === "credit_account")
          .reduce((s, p) => s + Number(p.amount), 0)
        const received = periodPayments.filter((p) => p.method !== "credit_account")
          .reduce((s, p) => s + Number(p.amount), 0)

        const closing = Number(acct.balance)
        const opening = closing - charges + received

        const openInvoices = await db()
          .select({
            balanceDue: invoices.balanceDue,
            dueDate: invoices.dueDate,
            issueDate: invoices.issueDate,
            createdAt: invoices.createdAt,
          })
          .from(invoices)
          .where(and(
            eq(invoices.garageId, acct.garageId),
            eq(invoices.customerId, acct.customerId),
            eq(invoices.creditAccountId, acct.id),
            sql`${invoices.status} IN ('issued','partially_paid')`,
          ))
        const ageing = ageingBuckets(
          openInvoices.map((i) => ({
            balanceDue: Number(i.balanceDue),
            dueDate: i.dueDate,
            issueDate: i.issueDate,
            createdAt: i.createdAt.toISOString(),
          })),
          today
        )

        const statementId = randomUUID()
        await db().insert(creditStatements).values({
          id: statementId,
          garageId: acct.garageId,
          creditAccountId: acct.id,
          periodStart: period.start,
          periodEnd: period.end,
          openingBalance: BigInt(opening),
          charges: BigInt(charges),
          payments: BigInt(received),
          closingBalance: BigInt(closing),
          ageing,
        })

        // statement due item (vehicle optional — use customer's first)
        const [cust] = await db().select({ phone: customers.phone }).from(customers)
          .where(eq(customers.id, acct.customerId)).limit(1)
        const [veh] = await db().select({ id: vehicles.id }).from(vehicles)
          .where(and(eq(vehicles.garageId, acct.garageId), eq(vehicles.currentOwnerId, acct.customerId))).limit(1)
        const [gr] = await db().select({ name: garages.name }).from(garages)
          .where(eq(garages.id, acct.garageId)).limit(1)

        if (veh) {
          const token = randomBytes(24).toString("hex")
          await db().insert(dueItems).values({
            garageId: acct.garageId,
            vehicleId: veh.id,
            customerId: acct.customerId,
            type: "credit_statement",
            title: `Statement ${period.start} → ${period.end} — balance GH₵ ${(closing / 100).toFixed(2)}`,
            dueDate: today,
            effectiveDueDate: today,
            status: "due",
            sourceType: "credit_statement",
            sourceId: statementId,
            actionTokenHash: sha256(token),
          })
        }

        if (cust?.phone) {
          const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
          const ghs = `GH₵ ${(closing / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
          await sendMessage({
            garageId: acct.garageId,
            channel: "sms",
            to: cust.phone,
            templateKey: "credit_statement_ready",
            variables: {
              garage_name: gr?.name ?? "Garage",
              balance: ghs,
              due_date: today,
              action_link: `${base}/portal`,
            },
            idempotencyKey: `credit-stmt:${acct.id}:${period.start}`,
          }).catch(() => undefined)
        }

        return { statementId, closing }
      })
      if (!("skipped" in result)) generated++
    }

    return { accounts: due.length, generated }
  }
)
