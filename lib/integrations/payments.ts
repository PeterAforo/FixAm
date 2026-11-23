import "server-only"
import type { PaymentProvider, PayoutProvider } from "./types"
import { createMockPaymentProvider, createMockPayoutProvider } from "./payments/mock"
import { createTellerProvider } from "./payments/theteller"

/**
 * PAYMENT_PROVIDER=theteller|mock (default mock). theTeller covers both
 * collections and float payouts; the mock settles from /dev/payments.
 */

let cached: PaymentProvider | undefined
let cachedPayout: PayoutProvider | undefined
let teller: ReturnType<typeof createTellerProvider> | undefined

function selected(): string {
  return process.env.PAYMENT_PROVIDER ?? "mock"
}

function tellerConfigured(): boolean {
  return Boolean(process.env.THETELLER_MERCHANT_ID && process.env.THETELLER_API_USER && process.env.THETELLER_API_KEY)
}

export function paymentProvider(): PaymentProvider {
  if (cached) return cached
  const sel = selected()
  if (sel === "theteller" && tellerConfigured()) {
    teller ??= createTellerProvider()
    cached = teller
  } else {
    if (sel !== "mock") console.warn(`[integrations] PAYMENT_PROVIDER=${sel} unavailable (missing credentials?); using mock`)
    cached = createMockPaymentProvider()
  }
  return cached
}

export function payoutProvider(): PayoutProvider {
  if (cachedPayout) return cachedPayout
  if (selected() === "theteller" && tellerConfigured()) {
    teller ??= createTellerProvider()
    cachedPayout = teller
  } else {
    cachedPayout = createMockPayoutProvider()
  }
  return cachedPayout
}
