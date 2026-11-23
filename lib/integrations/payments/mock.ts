import "server-only"
import { randomUUID } from "node:crypto"
import type {
  MoMoChargeResult,
  PaymentInitResult,
  PaymentProvider,
  PaymentVerification,
  PayoutProvider,
  PayoutResult,
  RefundResult,
} from "../types"

/**
 * Mock payment provider. Transactions are recorded in-memory and viewable
 * at /dev/payments, where they can be completed or failed manually.
 */

export type MockTransaction = {
  reference: string
  amountPesewas: string // bigint as string for JSON
  kind: "checkout" | "momo" | "refund" | "payout"
  status: "pending" | "success" | "failed"
  createdAt: string
  paidAt?: string
}

const transactions = new Map<string, MockTransaction>()

export function listMockTransactions(): MockTransaction[] {
  return [...transactions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function setMockTransactionStatus(reference: string, status: "success" | "failed") {
  const tx = transactions.get(reference)
  if (!tx) return false
  tx.status = status
  if (status === "success") tx.paidAt = new Date().toISOString()
  return true
}

export function createMockPaymentProvider(): PaymentProvider {
  return {
    name: "mock",

    async initializeCheckout(input): Promise<PaymentInitResult> {
      transactions.set(input.reference, {
        reference: input.reference,
        amountPesewas: input.amountPesewas.toString(),
        kind: "checkout",
        status: "pending",
        createdAt: new Date().toISOString(),
      })
      return {
        authorizationUrl: `/dev/payments?ref=${encodeURIComponent(input.reference)}`,
        reference: input.reference,
      }
    },

    async chargeMobileMoney(input): Promise<MoMoChargeResult> {
      transactions.set(input.reference, {
        reference: input.reference,
        amountPesewas: input.amountPesewas.toString(),
        kind: "momo",
        status: "pending",
        createdAt: new Date().toISOString(),
      })
      return {
        status: "pending",
        displayText: `Check your phone for the MoMo prompt (${input.network})`,
      }
    },

    async verify(reference): Promise<PaymentVerification> {
      const tx = transactions.get(reference)
      if (!tx) {
        return { status: "failed", amountPesewas: 0n }
      }
      return {
        status: tx.status === "success" ? "success" : tx.status === "failed" ? "failed" : "pending",
        amountPesewas: BigInt(tx.amountPesewas),
        channel: tx.kind,
        paidAt: tx.paidAt,
      }
    },

    async refund(input): Promise<RefundResult> {
      const refundId = `mock_refund_${randomUUID()}`
      transactions.set(refundId, {
        reference: refundId,
        amountPesewas: (input.amountPesewas ?? 0n).toString(),
        kind: "refund",
        status: "success",
        createdAt: new Date().toISOString(),
      })
      return { refundId, status: "success" }
    },

    async parseWebhook(req: Request) {
      const body = (await req.json()) as { event?: string; id?: string; data?: unknown }
      return {
        event: body.event ?? "unknown",
        data: body.data,
        eventId: body.id ?? randomUUID(),
      }
    },
  }
}

/**
 * Mock payouts — succeed immediately unless the account number ends in 0000
 * (fails, retryable) or 9999 (fails permanently), so retry paths can be tested.
 */
export function createMockPayoutProvider(): PayoutProvider {
  function outcome(account: string, transactionId: string, amount: bigint): PayoutResult {
    const digits = account.replace(/\D/g, "")
    transactions.set(transactionId, {
      reference: transactionId,
      amountPesewas: amount.toString(),
      kind: "payout",
      status: digits.endsWith("0000") || digits.endsWith("9999") ? "failed" : "success",
      createdAt: new Date().toISOString(),
    })
    if (digits.endsWith("0000")) return { status: "failed", code: "105", message: "Mock transient failure", retryable: true }
    if (digits.endsWith("9999")) return { status: "failed", code: "102", message: "Mock: number not registered", retryable: false }
    return { status: "success", providerReference: `mock_${transactionId}`, accountName: "MOCK ACCOUNT" }
  }
  return {
    name: "mock",
    async transferMomo(input) {
      return outcome(input.phone, input.transactionId, input.amountPesewas)
    },
    async transferBank(input) {
      return outcome(input.accountNumber, input.transactionId, input.amountPesewas)
    },
    async verifyTransfer(transactionId) {
      const tx = transactions.get(transactionId)
      if (!tx) return { status: "failed", code: "NOT_FOUND", message: "Unknown payout", retryable: false }
      return tx.status === "success" ? { status: "success" } : tx.status === "pending" ? { status: "pending" } : { status: "failed", code: "105", message: "Mock failure", retryable: true }
    },
  }
}
