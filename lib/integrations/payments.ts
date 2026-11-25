import "server-only"
import { eq } from "drizzle-orm"
import type { PaymentProvider, PayoutProvider } from "./types"
import { createMockPaymentProvider, createMockPayoutProvider } from "./payments/mock"
import { createTellerProvider, type TellerConfig } from "./payments/theteller"
import { createPaystackProvider } from "./payments/paystack"
import { activeProvider, savedProvider, type ActiveProvider } from "./config"

/**
 * Which gateway takes a payment:
 *  1. the gateway an admin switched on in /admin/integrations (saved, encrypted keys);
 *  2. otherwise PAYMENT_PROVIDER=theteller|mock (default mock) with env keys.
 * Every reference is recorded against the gateway that started it, so verify
 * and refund go back to the same gateway even after the admin switches.
 * Payouts always use theTeller (float account) or the mock.
 */

function tellerConfigFrom(creds: Record<string, string>): TellerConfig {
  return { env: creds.env, merchantId: creds.merchant_id, apiUser: creds.api_user, apiKey: creds.api_key, passCode: creds.pass_code }
}

function envTellerConfigured(): boolean {
  return Boolean(process.env.THETELLER_MERCHANT_ID && process.env.THETELLER_API_USER && process.env.THETELLER_API_KEY)
}

function adapterFor(cfg: ActiveProvider): PaymentProvider | null {
  if (cfg.provider === "theteller") return createTellerProvider(fetch, tellerConfigFrom(cfg.creds))
  if (cfg.provider === "paystack") return createPaystackProvider({ secretKey: cfg.creds.secret_key })
  return null
}

let envCached: PaymentProvider | undefined
function envPaymentProvider(): PaymentProvider {
  if (envCached) return envCached
  const sel = process.env.PAYMENT_PROVIDER ?? "mock"
  if (sel === "theteller" && envTellerConfigured()) envCached = createTellerProvider()
  else if (sel === "paystack" && process.env.PAYSTACK_SECRET_KEY) envCached = createPaystackProvider()
  else {
    if (sel !== "mock") console.warn(`[integrations] PAYMENT_PROVIDER=${sel} unavailable (missing credentials?); using mock`)
    envCached = createMockPaymentProvider()
  }
  return envCached
}

async function currentGateway(): Promise<PaymentProvider> {
  const cfg = await activeProvider("payments")
  return (cfg && adapterFor(cfg)) || envPaymentProvider()
}

/** The gateway that started this reference (falls back to the current one). */
async function gatewayForReference(reference: string): Promise<PaymentProvider> {
  try {
    const { db } = await import("@/lib/db")
    const { paymentGatewayRefs } = await import("@/lib/db/schema")
    const [row] = await db().select().from(paymentGatewayRefs).where(eq(paymentGatewayRefs.reference, reference)).limit(1)
    if (row) {
      const env = envPaymentProvider()
      if (row.provider === env.name) return env
      const saved = await savedProvider("payments", row.provider)
      const a = saved && adapterFor(saved)
      if (a) return a
    }
  } catch {
    /* table missing in an old database — use the current gateway */
  }
  return currentGateway()
}

async function remember(reference: string, provider: string) {
  try {
    const { db } = await import("@/lib/db")
    const { paymentGatewayRefs } = await import("@/lib/db/schema")
    await db().insert(paymentGatewayRefs).values({ reference, provider }).onConflictDoNothing()
  } catch (e) {
    console.warn("[payments] could not record gateway for", reference, (e as Error).message)
  }
}

const router: PaymentProvider = {
  name: "router",
  async initializeCheckout(input) {
    const g = await currentGateway()
    const res = await g.initializeCheckout(input)
    await remember(input.reference, g.name)
    return res
  },
  async chargeMobileMoney(input) {
    const g = await currentGateway()
    const res = await g.chargeMobileMoney(input)
    await remember(input.reference, g.name)
    return res
  },
  async verify(reference) {
    return (await gatewayForReference(reference)).verify(reference)
  },
  async refund(input) {
    return (await gatewayForReference(input.reference)).refund(input)
  },
  async parseWebhook(req) {
    return (await currentGateway()).parseWebhook(req)
  },
}

export function paymentProvider(): PaymentProvider {
  return router
}

/** theTeller payouts: admin-saved theTeller keys if any, else env, else the mock. */
const payoutRouter: PayoutProvider = {
  name: "payout-router",
  async transferMomo(input) {
    return (await payoutGateway()).transferMomo(input)
  },
  async transferBank(input) {
    return (await payoutGateway()).transferBank(input)
  },
  async verifyTransfer(id) {
    return (await payoutGateway()).verifyTransfer(id)
  },
}

let envPayout: PayoutProvider | undefined
async function payoutGateway(): Promise<PayoutProvider> {
  const saved = await savedProvider("payments", "theteller")
  if (saved && saved.creds.merchant_id && saved.creds.api_key) return createTellerProvider(fetch, tellerConfigFrom(saved.creds))
  if (!envPayout) {
    envPayout = (process.env.PAYMENT_PROVIDER ?? "mock") === "theteller" && envTellerConfigured() ? createTellerProvider() : createMockPayoutProvider()
  }
  return envPayout
}

export function payoutProvider(): PayoutProvider {
  return payoutRouter
}
