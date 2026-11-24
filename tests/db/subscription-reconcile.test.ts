import { afterAll, describe, expect, it, vi } from "vitest"
import postgres from "postgres"
import { randomUUID } from "node:crypto"

vi.mock("server-only", () => ({}))

/**
 * Subscription payment reconciliation — runs against the real DB when
 * DATABASE_URL is set and PAYMENT_PROVIDER resolves to the mock (the
 * default without theTeller credentials). Seeds subscription rows with a
 * pending payment reference, drives the mock gateway pending → success,
 * and asserts the subscription activates exactly once.
 */

const url = process.env.DATABASE_URL ?? process.env.TEST_DB_URL
const hasDb = Boolean(url)

const sql = hasDb ? postgres(url!, { prepare: false, max: 1 }) : null

const tag = randomUUID().slice(0, 8)
const ownerId = `+23320000${tag.replace(/\D/g, "").padEnd(4, "0").slice(0, 4)}`
const accountRef = `TEST-ACCT-${tag}`
const garageRef = `TEST-GARAGE-${tag}`
const garageId = randomUUID()
const accountSubId = randomUUID()
const garageSubId = randomUUID()

let planId = ""

async function seed() {
  const [plan] = await sql!`select id from public.plans where is_active = true limit 1`
  if (!plan) throw new Error("No active plan — run pnpm db:seed first")
  planId = plan.id as string

  await sql!`insert into public.garages (id, name, slug, phone) values
    (${garageId}, ${`Reconcile Garage ${tag}`}, ${`recon-${tag}`}, '+233200000777')`
  await sql!`insert into public.subscriptions (id, garage_id, plan_id, status, pending_payment_reference)
    values (${garageSubId}, ${garageId}, ${planId}, 'past_due', ${garageRef})`
  await sql!`insert into public.account_subscriptions (id, owner_kind, owner_id, plan_id, status, pending_payment_reference)
    values (${accountSubId}, 'driver', ${ownerId}, ${planId}, 'past_due', ${accountRef})`
}

async function cleanup() {
  await sql!`delete from public.account_subscriptions where id = ${accountSubId}`
  await sql!`delete from public.subscriptions where id = ${garageSubId}`
  await sql!`delete from public.garages where id = ${garageId}`
}

describe.skipIf(!hasDb || process.env.RECONCILE_TEST_DISABLE === "1")(
  "subscription payment reconcile (requires DATABASE_URL + mock payment provider)",
  () => {
    afterAll(async () => {
      if (!sql) return
      try {
        await cleanup()
      } finally {
        await sql.end()
      }
    })

    it("account subscription: pending → active on gateway success", async () => {
      const { paymentProvider } = await import("@/lib/integrations/payments")
      if (paymentProvider().name !== "mock") {
        // theTeller creds present — verify() would hit the real API; skip.
        return
      }
      const { reconcileSubscriptionPayment } = await import("@/lib/escrow/service")
      const { setMockTransactionStatus } = await import("@/lib/integrations/payments/mock")

      await seed()
      await paymentProvider().initializeCheckout({
        reference: accountRef,
        amountPesewas: 100n,
        description: "test",
        returnPath: "/portal/settings",
      })

      expect(await reconcileSubscriptionPayment(accountRef)).toBe("pending")

      setMockTransactionStatus(accountRef, "success")
      expect(await reconcileSubscriptionPayment(accountRef)).toBe("success")
      // Replay is idempotent.
      expect(await reconcileSubscriptionPayment(accountRef)).toBe("success")

      const [row] = await sql!`select status, pending_payment_reference, last_payment_reference,
          current_period_end > now() as period_ok
        from public.account_subscriptions where id = ${accountSubId}`
      expect(row.status).toBe("active")
      expect(row.pending_payment_reference).toBeNull()
      expect(row.last_payment_reference).toBe(accountRef)
      expect(row.period_ok).toBe(true)
    }, 30000)

    it("garage subscription: pending → active on gateway success", async () => {
      const { paymentProvider } = await import("@/lib/integrations/payments")
      if (paymentProvider().name !== "mock") return
      const { reconcileSubscriptionPayment } = await import("@/lib/escrow/service")
      const { setMockTransactionStatus } = await import("@/lib/integrations/payments/mock")

      await paymentProvider().initializeCheckout({
        reference: garageRef,
        amountPesewas: 200n,
        description: "test",
        returnPath: "/g/x/settings",
      })

      expect(await reconcileSubscriptionPayment(garageRef)).toBe("pending")
      setMockTransactionStatus(garageRef, "success")
      expect(await reconcileSubscriptionPayment(garageRef)).toBe("success")

      const [row] = await sql!`select status, is_complimentary, pending_payment_reference,
          paystack_subscription_code, current_period_end > now() as period_ok
        from public.subscriptions where id = ${garageSubId}`
      expect(row.status).toBe("active")
      expect(row.is_complimentary).toBe(false)
      expect(row.pending_payment_reference).toBeNull()
      expect(row.paystack_subscription_code).toBe(garageRef)
      expect(row.period_ok).toBe(true)
    }, 30000)
  }
)
