import type {
  MoMoChargeResult,
  PaymentInitResult,
  PaymentProvider,
  PaymentVerification,
  PayoutNetwork,
  PayoutProvider,
  PayoutResult,
  RefundResult,
} from "../types"

/**
 * PaySwitch theTeller — https://theteller.net/documentation
 *
 * Env: THETELLER_ENV=test|live, THETELLER_MERCHANT_ID, THETELLER_API_USER,
 * THETELLER_API_KEY, THETELLER_PASS_CODE (float account, payouts),
 * optional THETELLER_API_BASE / THETELLER_CHECKOUT_URL overrides,
 * NEXT_PUBLIC_APP_URL (redirect_url base).
 *
 * theTeller has no webhooks: callers confirm via the redirect handler and the
 * Inngest poller, both of which call verify(). transaction_id must be a unique
 * 12-digit number and amount a 12-char zero-padded pesewa string.
 */

export class TellerError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

type Env = { apiBase: string; checkoutUrl: string; reversalUrl: string }

/** Credentials saved in /admin/integrations; anything left out falls back to env vars. */
export type TellerConfig = {
  env?: string
  merchantId?: string
  apiUser?: string
  apiKey?: string
  passCode?: string
}

export function tellerEnv(mode?: string): Env {
  const live = (mode || process.env.THETELLER_ENV) === "live"
  return {
    apiBase: (process.env.THETELLER_API_BASE || (live ? "https://prod.theteller.net" : "https://test.theteller.net")).replace(/\/$/, ""),
    checkoutUrl: process.env.THETELLER_CHECKOUT_URL || (live ? "https://checkout.theteller.net/initiate" : "https://test.theteller.net/checkout/initiate"),
    reversalUrl: `${live ? "https://prod.theteller.net" : "https://test.theteller.net"}/rest/resources/card/reversal`,
  }
}

/** 12-char zero-padded minor units. */
export function tellerAmount(pesewas: bigint): string {
  if (pesewas <= 0n) throw new TellerError("AMOUNT", "Amount must be positive")
  const s = pesewas.toString()
  if (s.length > 12) throw new TellerError("AMOUNT", "Amount too large")
  return s.padStart(12, "0")
}

export function assertTxnId(id: string): string {
  if (!/^\d{12}$/.test(id)) throw new TellerError("REFERENCE", "theTeller transaction_id must be 12 digits")
  return id
}

/** 233XXXXXXXXX for subscriber_number (10–12 digits). */
export function tellerMsisdn(phone: string): string {
  const d = phone.replace(/\D/g, "")
  if (d.startsWith("233")) return d
  if (d.startsWith("0")) return `233${d.slice(1)}`
  return d
}

/** Local 0XXXXXXXXX for payout account_number. */
export function localMsisdn(phone: string): string {
  const d = phone.replace(/\D/g, "")
  if (d.startsWith("233")) return `0${d.slice(3)}`
  return d.startsWith("0") ? d : `0${d}`
}

const RSWITCH: Record<PayoutNetwork, string> = { mtn: "MTN", telecel: "VDF", airteltigo: "ATL" }

/** Response codes → our three states. */
export function classifyCode(code: string | undefined, status?: string): "success" | "pending" | "failed" {
  const c = (code ?? "").trim()
  if (c === "000") return "success"
  if (c === "111" || c === "099" || c === "107") return "pending"
  const s = (status ?? "").toLowerCase()
  if (s === "approved" || s === "successful" || s === "success") return "success"
  if (s === "pending" || s === "processing") return "pending"
  return "failed"
}

const CODE_MESSAGE: Record<string, string> = {
  "100": "Transaction declined",
  "101": "Not enough money in the wallet",
  "102": "Number not registered for mobile money",
  "103": "Wrong PIN or the prompt timed out",
  "104": "Transaction declined or cancelled",
  "105": "Payment failed — please try again",
  "107": "USSD is busy — please try again",
  "600": "Payment gateway access denied",
  "909": "Duplicate transaction",
  "979": "Payment gateway credentials are invalid",
  "999": "Payment gateway merchant not set",
}

export function codeMessage(code: string | undefined, fallback?: string): string {
  return CODE_MESSAGE[(code ?? "").trim()] ?? fallback ?? "Payment failed"
}

/** Codes worth retrying for payouts (transient). */
const RETRYABLE = new Set(["105", "107", "111", "099", "", "HTTP"])

type TellerJson = {
  status?: string
  code?: string | number
  reason?: string
  token?: string
  checkout_url?: string
  transaction_id?: string
  amount?: number | string
  r_switch?: string
  reference_id?: string
  account_name?: string
}

function creds(cfg: TellerConfig = {}) {
  const merchant = cfg.merchantId || process.env.THETELLER_MERCHANT_ID
  const user = cfg.apiUser || process.env.THETELLER_API_USER
  const key = cfg.apiKey || process.env.THETELLER_API_KEY
  if (!merchant || !user || !key) throw new TellerError("NOT_CONFIGURED", "theTeller credentials are not set")
  return { merchant, auth: `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}` }
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "")
}

/** redirect_url with no query string (theTeller appends its own `?code=…`). */
export function returnUrl(reference: string, returnPath?: string): string {
  const safe = returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/"
  const enc = Buffer.from(safe).toString("base64url")
  return `${siteUrl()}/api/payments/return/${reference}/${enc}`
}

export function createTellerProvider(fetchImpl: typeof fetch = fetch, cfg: TellerConfig = {}): PaymentProvider & PayoutProvider {
  async function call(url: string, init: RequestInit): Promise<TellerJson> {
    let res: Response
    try {
      res = await fetchImpl(url, { ...init, headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...(init.headers ?? {}) } })
    } catch (e) {
      throw new TellerError("HTTP", `theTeller unreachable: ${(e as Error).message}`)
    }
    const json = (await res.json().catch(() => ({}))) as TellerJson
    if (!res.ok && json.code === undefined) throw new TellerError("HTTP", `theTeller HTTP ${res.status}`)
    return json
  }

  function payoutOutcome(json: TellerJson): PayoutResult {
    const code = String(json.code ?? "")
    const state = classifyCode(code, json.status)
    if (state === "failed") return { status: "failed", code: code || "UNKNOWN", message: codeMessage(code, json.reason), retryable: RETRYABLE.has(code) }
    const ref = json.reference_id ?? json.transaction_id
    return state === "success" ? { status: "success", providerReference: ref, accountName: json.account_name } : { status: "pending", providerReference: ref, accountName: json.account_name }
  }

  return {
    name: "theteller",

    async initializeCheckout(input): Promise<PaymentInitResult> {
      const { merchant, auth } = creds(cfg)
      const json = await call(tellerEnv(cfg.env).checkoutUrl, {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({
          merchant_id: merchant,
          transaction_id: assertTxnId(input.reference),
          desc: (input.description ?? "FixAm payment").slice(0, 100),
          amount: tellerAmount(input.amountPesewas),
          redirect_url: returnUrl(input.reference, input.returnPath),
          email: input.email || process.env.THETELLER_DEFAULT_EMAIL || "payments@fixam.app",
        }),
      })
      if (!json.checkout_url) throw new TellerError(String(json.code ?? "INIT"), json.reason ?? "Could not start checkout")
      return { authorizationUrl: json.checkout_url, reference: input.reference }
    },

    async chargeMobileMoney(input): Promise<MoMoChargeResult> {
      const { merchant, auth } = creds(cfg)
      const json = await call(`${tellerEnv(cfg.env).apiBase}/v1.1/transaction/process`, {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({
          amount: tellerAmount(input.amountPesewas),
          processing_code: "000200",
          transaction_id: assertTxnId(input.reference),
          desc: (input.description ?? "FixAm payment").slice(0, 100),
          merchant_id: merchant,
          subscriber_number: tellerMsisdn(input.phone),
          "r-switch": RSWITCH[input.network],
        }),
      })
      const code = String(json.code ?? "")
      const state = classifyCode(code, json.status)
      if (state === "failed") return { status: "failed", displayText: codeMessage(code, json.reason) }
      if (state === "success") return { status: "success", displayText: "Payment received" }
      return {
        status: "pending",
        displayText:
          input.network === "mtn"
            ? "Approve the MoMo prompt on your phone. No prompt? Dial *170#, My Wallet, My Approvals."
            : "Approve the prompt on your phone to complete payment.",
      }
    },

    async verify(reference): Promise<PaymentVerification> {
      const { merchant } = creds(cfg)
      const json = await call(`${tellerEnv(cfg.env).apiBase}/v1.1/users/transactions/${encodeURIComponent(assertTxnId(reference))}/status`, {
        method: "GET",
        headers: { "Merchant-Id": merchant },
      })
      const state = classifyCode(String(json.code ?? ""), json.status)
      // `amount` in the status reply is in cedis (e.g. 1 = GH₵1.00).
      const cedis = Number(json.amount ?? 0)
      return {
        status: state,
        amountPesewas: Number.isFinite(cedis) ? BigInt(Math.round(cedis * 100)) : 0n,
        channel: json.r_switch,
        paidAt: state === "success" ? new Date().toISOString() : undefined,
      }
    },

    /** Card payments only (reversal). MoMo refunds are sent as float payouts by the escrow service. */
    async refund(input): Promise<RefundResult> {
      const { merchant, auth } = creds(cfg)
      if (!input.amountPesewas) throw new TellerError("AMOUNT", "Refund amount required")
      const json = await call(tellerEnv(cfg.env).reversalUrl, {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({ merchant_id: merchant, transaction_id: assertTxnId(input.reference), amount: tellerAmount(input.amountPesewas) }),
      })
      const state = classifyCode(String(json.code ?? ""), json.status)
      if (state === "failed") throw new TellerError(String(json.code ?? "REFUND"), codeMessage(String(json.code ?? ""), json.reason))
      return { refundId: `rev_${input.reference}`, status: state === "success" ? "success" : "pending" }
    },

    async parseWebhook() {
      throw new TellerError("UNSUPPORTED", "theTeller does not send webhooks — use the poller")
    },

    async transferMomo(input): Promise<PayoutResult> {
      const passCode = cfg.passCode || process.env.THETELLER_PASS_CODE
      if (!passCode) return { status: "failed", code: "NOT_CONFIGURED", message: "THETELLER_PASS_CODE is not set", retryable: false }
      const { merchant, auth } = creds(cfg)
      const json = await call(`${tellerEnv(cfg.env).apiBase}/v1.1/transaction/process`, {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({
          account_number: localMsisdn(input.phone),
          account_issuer: RSWITCH[input.network],
          merchant_id: merchant,
          transaction_id: assertTxnId(input.transactionId),
          processing_code: "404000",
          amount: tellerAmount(input.amountPesewas),
          "r-switch": "FLT",
          desc: input.description.slice(0, 100),
          pass_code: passCode,
        }),
      }).catch((e: TellerError) => ({ code: e.code, reason: e.message }) as TellerJson)
      return payoutOutcome(json)
    },

    async transferBank(input): Promise<PayoutResult> {
      const passCode = cfg.passCode || process.env.THETELLER_PASS_CODE
      if (!passCode) return { status: "failed", code: "NOT_CONFIGURED", message: "THETELLER_PASS_CODE is not set", retryable: false }
      const { merchant, auth } = creds(cfg)
      const api = tellerEnv(cfg.env).apiBase
      // 1. name enquiry
      const enquiry = await call(`${api}/v1.1/transaction/process`, {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({
          account_number: input.accountNumber.replace(/\s/g, ""),
          account_bank: input.bankCode,
          account_issuer: "GIP",
          merchant_id: merchant,
          transaction_id: assertTxnId(input.transactionId),
          processing_code: "404020",
          amount: tellerAmount(input.amountPesewas),
          "r-switch": "FLT",
          desc: input.description.slice(0, 100),
          pass_code: passCode,
        }),
      }).catch((e: TellerError) => ({ code: e.code, reason: e.message }) as TellerJson)
      const first = payoutOutcome(enquiry)
      if (first.status === "failed") return first
      if (!enquiry.reference_id) return { status: "failed", code: "NO_REFERENCE", message: enquiry.reason ?? "Bank name enquiry returned no reference", retryable: true }
      if (input.expectedName && enquiry.account_name && !namesMatch(input.expectedName, enquiry.account_name)) {
        return { status: "failed", code: "NAME_MISMATCH", message: `Bank account name is "${enquiry.account_name}"`, retryable: false }
      }
      // 2. authorize
      const auth2 = await call(`${api}/v1.1/transaction/bank/ftc/authorize`, {
        method: "POST",
        headers: { Authorization: auth },
        body: JSON.stringify({ merchant_id: merchant, reference_id: enquiry.reference_id }),
      }).catch((e: TellerError) => ({ code: e.code, reason: e.message }) as TellerJson)
      const out = payoutOutcome(auth2)
      if (out.status === "failed") return out
      return { ...out, providerReference: enquiry.reference_id, accountName: enquiry.account_name }
    },

    async verifyTransfer(transactionId): Promise<PayoutResult> {
      const { merchant } = creds(cfg)
      const json = await call(`${tellerEnv(cfg.env).apiBase}/v1.1/users/transactions/${encodeURIComponent(assertTxnId(transactionId))}/status`, {
        method: "GET",
        headers: { "Merchant-Id": merchant },
      }).catch((e: TellerError) => ({ code: e.code, reason: e.message }) as TellerJson)
      return payoutOutcome(json)
    },
  }
}

/** Loose name check: every word of the shorter name appears in the longer one. */
export function namesMatch(a: string, b: string): boolean {
  const words = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 1)
  const [x, y] = [words(a), words(b)]
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length === 0) return false
  return short.filter((w) => long.includes(w)).length >= Math.min(2, short.length)
}
