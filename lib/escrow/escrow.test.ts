import { describe, expect, it, vi } from "vitest"
import { canTransition, computeSplit, fromStatesFor, payoutBackoffMs } from "./split"
import { decryptPayoutAccount, encryptPayoutAccount, guessNetwork, maskPayoutAccount, parseFreeTextMomo } from "./payout-account"
import {
  classifyCode,
  createTellerProvider,
  localMsisdn,
  namesMatch,
  returnUrl,
  tellerAmount,
  tellerMsisdn,
} from "@/lib/integrations/payments/theteller"
import { createMockPayoutProvider } from "@/lib/integrations/payments/mock"

vi.mock("server-only", () => ({}))

describe("computeSplit", () => {
  it("takes commission in basis points and leaves the rest for the vendor", () => {
    expect(computeSplit({ gross: 100_00n, commissionBp: 500 })).toEqual({ gross: 10000n, commission: 500n, fittingFee: 0n, net: 9500n })
  })
  it("uses the stored commission and fitting fee", () => {
    expect(computeSplit({ gross: 50_000n, commissionAmount: 2_500n, fittingFee: 5_000n }).net).toBe(42_500n)
  })
  it("refuses fees larger than the payment", () => {
    expect(() => computeSplit({ gross: 1_000n, commissionAmount: 600n, fittingFee: 600n })).toThrow()
  })
})

describe("escrow state machine", () => {
  it("only allows sensible moves", () => {
    expect(canTransition("pending_payment", "held")).toBe(true)
    expect(canTransition("held", "released")).toBe(true)
    expect(canTransition("disputed", "refunded")).toBe(true)
    expect(canTransition("released", "refunded")).toBe(false)
    expect(canTransition("pending_payment", "released")).toBe(false)
    expect(fromStatesFor("released").sort()).toEqual(["disputed", "held"])
  })
  it("backs off payouts exponentially with a cap", () => {
    expect(payoutBackoffMs(1)).toBe(5 * 60_000)
    expect(payoutBackoffMs(3)).toBe(20 * 60_000)
    expect(payoutBackoffMs(20)).toBe(6 * 3600_000)
  })
})

describe("payout accounts", () => {
  it("round-trips encrypted and masks", () => {
    const enc = encryptPayoutAccount({ method: "momo", network: "mtn", phone: "0241234567", accountName: "Kofi Mensah" })
    expect(enc.startsWith("enc:v1:")).toBe(true)
    expect(enc).not.toContain("0241234567")
    const dec = decryptPayoutAccount(enc)
    expect(dec).toMatchObject({ phone: "0241234567" })
    expect(maskPayoutAccount(dec)).toBe("MTN MoMo ••• 4567 (Kofi Mensah)")
  })
  it("rejects legacy plaintext and tampering", () => {
    expect(decryptPayoutAccount("024 123 4567 Kofi")).toBeNull()
    const enc = encryptPayoutAccount({ method: "bank", bankCode: "GCB", accountNumber: "1234567890", accountName: "Ama Ltd" })
    expect(decryptPayoutAccount(enc.slice(0, -2) + "xx")).toBeNull()
  })
  it("parses onboarding's free-text MoMo line", () => {
    expect(guessNetwork("0201234567")).toBe("telecel")
    expect(parseFreeTextMomo("024 123 4567 · Kofi Mensah")).toMatchObject({ network: "mtn", phone: "0241234567", accountName: "Kofi Mensah" })
    expect(parseFreeTextMomo("GCB Kaneshie 12345")).toBeNull()
  })
})

describe("theTeller helpers", () => {
  it("formats amounts, numbers and codes", () => {
    expect(tellerAmount(150n)).toBe("000000000150")
    expect(() => tellerAmount(0n)).toThrow()
    expect(tellerMsisdn("024 123 4567")).toBe("233241234567")
    expect(localMsisdn("+233241234567")).toBe("0241234567")
    expect(classifyCode("000")).toBe("success")
    expect(classifyCode("111")).toBe("pending")
    expect(classifyCode("101")).toBe("failed")
    expect(classifyCode(undefined, "approved")).toBe("success")
  })
  it("builds a query-free redirect URL and refuses open redirects", () => {
    const url = returnUrl("100000000001", "/g/demo/marketplace?tab=orders")
    expect(url).not.toContain("?")
    const enc = url.split("/").pop()!
    expect(Buffer.from(enc, "base64url").toString()).toBe("/g/demo/marketplace?tab=orders")
    expect(Buffer.from(returnUrl("100000000001", "//evil.com").split("/").pop()!, "base64url").toString()).toBe("/")
  })
  it("matches bank account names loosely", () => {
    expect(namesMatch("Kofi Mensah", "MENSAH KOFI ATTA")).toBe(true)
    expect(namesMatch("Kofi Mensah", "Ama Owusu")).toBe(false)
  })
})

describe("theTeller provider", () => {
  const env = { THETELLER_MERCHANT_ID: "TTM-1", THETELLER_API_USER: "u", THETELLER_API_KEY: "k", THETELLER_PASS_CODE: "p" }
  Object.assign(process.env, env)

  it("sends a MoMo debit with 000200 and the right r-switch", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "111", status: "pending" }))) as unknown as typeof fetch
    const r = await createTellerProvider(fetchImpl).chargeMobileMoney({ amountPesewas: 2500n, phone: "0201234567", network: "telecel", reference: "100000000002" })
    expect(r.status).toBe("pending")
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://test.theteller.net/v1.1/transaction/process")
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ processing_code: "000200", "r-switch": "VDF", amount: "000000002500", subscriber_number: "233201234567" })
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("u:k").toString("base64")}`)
  })

  it("verifies with the Merchant-Id header and converts cedis to pesewas", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "000", status: "approved", amount: 25.5 }))) as unknown as typeof fetch
    const v = await createTellerProvider(fetchImpl).verify("100000000003")
    expect(v).toMatchObject({ status: "success", amountPesewas: 2550n })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)["Merchant-Id"]).toBe("TTM-1")
  })

  it("rejects non-12-digit references", async () => {
    await expect(createTellerProvider(vi.fn() as unknown as typeof fetch).verify("FIXAM-abc")).rejects.toThrow(/12 digits/)
  })

  it("pays out to MoMo via the float (404000 / FLT) and flags retryable failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "105", reason: "General failure" }))) as unknown as typeof fetch
    const r = await createTellerProvider(fetchImpl).transferMomo({ amountPesewas: 9500n, phone: "0241234567", network: "mtn", transactionId: "100000000004", description: "FixAm payout" })
    expect(r).toMatchObject({ status: "failed", retryable: true })
    const body = JSON.parse(((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ processing_code: "404000", "r-switch": "FLT", account_issuer: "MTN", account_number: "0241234567", pass_code: "p" })
  })

  it("does bank name enquiry then authorize, stopping on a name mismatch", async () => {
    const replies = [{ code: "000", reference_id: "R1", account_name: "AMA OWUSU" }]
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(replies.shift() ?? { code: "000" }))) as unknown as typeof fetch
    const r = await createTellerProvider(fetchImpl).transferBank({ amountPesewas: 9500n, accountNumber: "1234567890", bankCode: "GCB", transactionId: "100000000005", description: "x", expectedName: "Kofi Mensah" })
    expect(r).toMatchObject({ status: "failed", code: "NAME_MISMATCH", retryable: false })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
})

describe("mock payouts", () => {
  it("simulate success, transient and permanent failures", async () => {
    const p = createMockPayoutProvider()
    expect((await p.transferMomo({ amountPesewas: 1n, phone: "0241234567", network: "mtn", transactionId: "1", description: "" })).status).toBe("success")
    expect(await p.transferMomo({ amountPesewas: 1n, phone: "0241230000", network: "mtn", transactionId: "2", description: "" })).toMatchObject({ retryable: true })
    expect(await p.transferMomo({ amountPesewas: 1n, phone: "0241239999", network: "mtn", transactionId: "3", description: "" })).toMatchObject({ retryable: false })
  })
})
