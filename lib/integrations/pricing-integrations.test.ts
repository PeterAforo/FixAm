import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { fillSmsTemplate, createCustomHttpSmsProvider } from "./messaging/ghana-sms"
import { mapPaystackStatus, paystackEmail, createPaystackProvider } from "./payments/paystack"
import { applyBp } from "@/lib/platform/settings"

describe("fees", () => {
  it("takes basis points of an amount, rounding down", () => {
    expect(applyBp(10_000n, 600)).toBe(600n) // 6% of GH₵100
    expect(applyBp(2_000n, 1000)).toBe(200n) // 10% of GH₵20
    expect(applyBp(999n, 600)).toBe(59n)
    expect(applyBp(5_000n, 0)).toBe(0n)
  })
})

describe("custom SMS template", () => {
  it("escapes JSON bodies and URL-encodes queries", () => {
    const vars = { to: "233241234567", message: 'Hi "Ama" & co', sender: "FIXAM" }
    expect(fillSmsTemplate('{"to":"{{to}}","text":"{{message}}"}', vars, "json")).toBe('{"to":"233241234567","text":"Hi \\"Ama\\" & co"}')
    expect(fillSmsTemplate("to={{to}}&msg={{message}}", vars, "query")).toBe("to=233241234567&msg=Hi%20%22Ama%22%20%26%20co")
  })
  it("refuses a non-https URL", async () => {
    const p = createCustomHttpSmsProvider({ url: "http://example.com/send" })
    await expect(
      p.send({ channel: "sms", to: "0241234567", templateKey: "t", variables: {}, rendered: { body: "x" }, idempotencyKey: "k" }),
    ).rejects.toThrow(/https/)
  })
})

describe("paystack", () => {
  it("maps statuses and builds a fallback e-mail", () => {
    expect(mapPaystackStatus("success")).toBe("success")
    expect(mapPaystackStatus("abandoned")).toBe("failed")
    expect(mapPaystackStatus("ongoing")).toBe("pending")
    expect(paystackEmail(undefined, "+233 24 123 4567")).toBe("233241234567@pay.fixam.app")
    expect(paystackEmail("ama@example.com")).toBe("ama@example.com")
  })
  it("verifies a reference with the secret key", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: true, data: { status: "success", amount: 34900, channel: "mobile_money" } }), { status: 200 }),
    ) as unknown as typeof fetch
    const v = await createPaystackProvider({ secretKey: "sk_test_x" }, fetchImpl).verify("000000000123")
    expect(v).toMatchObject({ status: "success", amountPesewas: 34900n, channel: "mobile_money" })
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
    expect(url).toBe("https://api.paystack.co/transaction/verify/000000000123")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x")
  })
})
