import "server-only"
import type { PaymentProvider } from "./types"
import { createMockPaymentProvider } from "./payments/mock"

let cached: PaymentProvider | undefined

export function paymentProvider(): PaymentProvider {
  const selected = process.env.PAYMENT_PROVIDER ?? "mock"
  if (selected !== "mock") {
    console.warn(`[integrations] PAYMENT_PROVIDER=${selected} not implemented; using mock`)
  }
  if (!cached) cached = createMockPaymentProvider()
  return cached
}
