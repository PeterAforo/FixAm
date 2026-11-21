import { and, eq, inArray, lt, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { dueItems, instalments, paymentPlans } from "@/lib/db/schema"
import { computeLateFee, type LateFeeRule } from "@/lib/domain/instalments"
import { inngest } from "../client"

const todayISO = () => new Date().toISOString().slice(0, 10)

/** Daily sweep: mark instalments due/overdue, apply late fees once, sync due items. */
export const instalmentSweep = inngest.createFunction(
  {
    id: "instalment-sweep",
    retries: 1,
    triggers: [{ cron: "10 1 * * *" }],
  },
  async ({ step }) => {
    const today = todayISO()

    const open = await step.run("list-open", async () =>
      db()
        .select({
          id: instalments.id,
          garageId: instalments.garageId,
          paymentPlanId: instalments.paymentPlanId,
          dueDate: instalments.dueDate,
          amount: instalments.amount,
          amountPaid: instalments.amountPaid,
          lateFee: instalments.lateFee,
          status: instalments.status,
          lateFeeRule: paymentPlans.lateFeeRule,
        })
        .from(instalments)
        .innerJoin(paymentPlans, eq(instalments.paymentPlanId, paymentPlans.id))
        .where(and(
          eq(instalments.garageId, paymentPlans.garageId),
          inArray(instalments.status, ["upcoming", "due"]),
          or(lt(instalments.dueDate, today), eq(instalments.dueDate, today)),
        ))
    )

    let updated = 0
    for (const inst of open) {
      await step.run(`inst-${inst.id}`, async () => {
        const overdue = inst.dueDate < today
        const rule = inst.lateFeeRule as LateFeeRule | null
        const lateFee = overdue && Number(inst.lateFee) === 0
          ? computeLateFee({ amount: Number(inst.amount) - Number(inst.amountPaid), dueDate: inst.dueDate, today, rule })
          : Number(inst.lateFee)

        await db().update(instalments).set({
          status: overdue ? "overdue" : "due",
          lateFee: BigInt(lateFee),
          updatedAt: new Date(),
        }).where(eq(instalments.id, inst.id))

        await db().update(dueItems).set({
          status: overdue ? "overdue" : "due",
          effectiveDueDate: inst.dueDate,
          updatedAt: new Date(),
        }).where(and(
          eq(dueItems.garageId, inst.garageId),
          eq(dueItems.sourceType, "instalment"),
          eq(dueItems.sourceId, inst.id),
          inArray(dueItems.status, ["scheduled", "due_soon", "due"]),
        ))
      })
      updated++
    }

    // defaulted plans: active plan whose oldest unpaid instalment is >30d overdue
    const defaulted = await step.run("defaulted-plans", async () => {
      const rows = await db()
        .select({ id: paymentPlans.id, garageId: paymentPlans.garageId })
        .from(paymentPlans)
        .where(eq(paymentPlans.status, "active"))
      let count = 0
      for (const plan of rows) {
        const [oldest] = await db()
          .select({ dueDate: instalments.dueDate, status: instalments.status })
          .from(instalments)
          .where(and(eq(instalments.paymentPlanId, plan.id), inArray(instalments.status, ["due", "overdue"])))
          .orderBy(instalments.dueDate)
          .limit(1)
        if (oldest && oldest.dueDate < addDaysISO(today, -30)) {
          await db().update(paymentPlans).set({ status: "defaulted", updatedAt: new Date() }).where(eq(paymentPlans.id, plan.id))
          count++
        }
      }
      return count
    })

    return { scanned: open.length, updated, defaultedPlans: defaulted }
  }
)

function addDaysISO(iso: string, days: number) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
