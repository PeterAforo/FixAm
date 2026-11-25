import { createHmac, timingSafeEqual } from "node:crypto"
import type { MoMoChargeResult, PaymentInitResult, PaymentProvider, PaymentVerification, RefundResult } from "../types"
import { returnUrl } from "./theteller"

/**
 * Paystack (Ghana) — https://paystack.com/docs. Collections only: checkout,
 * MoMo charge, verify, refund and signed webhooks. Payouts stay on theTeller.
 * Amounts are pesewas; currency GHS. Uses the same 12-digit references.
 */

export type PaystackConfig = { secretKey?: string }

const API = "https://api.paystack.co"
const NETWORK: Record<"mtn" | "telecel" | "airteltigo", string> = { mtn: "mtn", telecel: "vod", airteltigo: "atl" }

export class PaystackError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

/** Paystack needs an e-mail; fall back to a placeholder tied to the phone. */
export function paystackEmail(email?: string, phone?: string): string {
  if (email && /.+@.+\..+/.test(email)) return email
  const digits = (phone ?? "").replace(/\D/g, "")
  return digits ? `${digits}@pay.fixam.app` : "payments@fixam.app"
}

export function mapPaystackStatus(status: string | undefined): "success" | "failed" | "pending" {
  const s = (status ?? "").toLowerCase()
  if (s === "success") return "success"
  if (s === "failed" || s === "abandoned" || s === "reversed") return "failed"
  return "pending"
}

export function createPaystackProvider(cfg: PaystackConfig = {}, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const secret = () => {
    const k = cfg.secretKey || process.env.PAYSTACK_SECRET_KEY
    if (!k) throw new PaystackError("NOT_CONFIGURED", "Paystack secret key is not set")
    return k
  }

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      if (e instanceof PaystackError) throw e
      throw new PaystackError("HTTP", `Paystack unreachable: ${(e as Error).message}`)
    }
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown }
    if (!res.ok || json.status === false) throw new PaystackError(String(res.status), json.message ?? `Paystack HTTP ${res.status}`)
    return json.data as T
  }

  return {
    name: "paystack",

    async initializeCheckout(input): Promise<PaymentInitResult> {
      const data = await call<{ authorization_url?: string; reference?: string }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: paystackEmail(input.email, input.phone),
          amount: input.amountPesewas.toString(),
          currency: "GHS",
          reference: input.reference,
          callback_url: returnUrl(input.reference, input.returnPath),
          channels: ["mobile_money", "card", "bank_transfer"],
          metadata: { ...(input.metadata ?? {}), description: input.description ?? "FixAm payment" },
        }),
      })
      if (!data?.authorization_url) throw new PaystackError("INIT", "Could not start checkout")
      return { authorizationUrl: data.authorization_url, reference: input.reference }
    },

    async chargeMobileMoney(input): Promise<MoMoChargeResult> {
      const data = await call<{ status?: string; display_text?: string; message?: string }>("/charge", {
        method: "POST",
        body: JSON.stringify({
          email: paystackEmail(undefined, input.phone),
          amount: input.amountPesewas.toString(),
          currency: "GHS",
          reference: input.reference,
          mobile_money: { phone: input.phone, provider: NETWORK[input.network] },
          metadata: { ...(input.metadata ?? {}), description: input.description ?? "FixAm payment" },
        }),
      })
      const state = mapPaystackStatus(data?.status)
      if (state === "success") return { status: "success", displayText: "Payment received" }
      if (state === "failed") return { status: "failed", displayText: data?.message ?? "Payment failed" }
      return { status: "pending", displayText: data?.display_text ?? "Approve the prompt on your phone to complete payment." }
    },

    async verify(reference): Promise<PaymentVerification> {
      const data = await call<{ status?: string; amount?: number; channel?: string; paid_at?: string }>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      )
      const status = mapPaystackStatus(data?.status)
      return {
        status,
        amountPesewas: BigInt(Math.round(Number(data?.amount ?? 0))),
        channel: data?.channel,
        paidAt: status === "success" ? (data?.paid_at ?? new Date().toISOString()) : undefined,
      }
    },

    async refund(input): Promise<RefundResult> {
      const data = await call<{ id?: number; status?: string }>("/refund", {
        method: "POST",
        body: JSON.stringify({ transaction: input.reference, ...(input.amountPesewas ? { amount: input.amountPesewas.toString() } : {}) }),
      })
      return { refundId: String(data?.id ?? `rf_${input.reference}`), status: data?.status ?? "pending" }
    },

    async parseWebhook(req) {
      const raw = await req.text()
      const sig = req.headers.get("x-paystack-signature") ?? ""
      const expected = createHmac("sha512", secret()).update(raw).digest("hex")
      const ok = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      if (!ok) throw new PaystackError("SIGNATURE", "Invalid Paystack signature")
      const body = JSON.parse(raw) as { event?: string; data?: { id?: number; reference?: string } }
      return { event: body.event ?? "unknown", data: body.data, eventId: String(body.data?.id ?? body.data?.reference ?? Date.now()) }
    },
  }
}
