import { describe, expect, it, vi } from "vitest"
import { minimisePii } from "./pii"
import { buildClaudeBody, createClaudeProvider } from "@/lib/integrations/ai/claude"
import { createMockAiProvider } from "@/lib/integrations/ai/mock"
import { createKhayaProvider, khayaPair, parseText } from "@/lib/integrations/speech/khaya"
import { createMockSpeechProvider } from "@/lib/integrations/speech/mock"
import { translatePrompt } from "./prompts"

describe("minimisePii", () => {
  it("strips phones, e-mails, Ghana Card and plates but keeps the vehicle", () => {
    const out = minimisePii("Call 024 412 3456 or +233 20 111 2222, ama@mail.com, GHA-123456789-0, plate GR 1234-22. Toyota Corolla 2012 brakes squeak")
    expect(out).not.toMatch(/412|111|ama@|123456789|1234-22/)
    expect(out).toContain("[phone]")
    expect(out).toContain("[email]")
    expect(out).toContain("[id]")
    expect(out).toContain("[plate]")
    expect(out).toContain("Toyota Corolla 2012 brakes squeak")
  })
})

describe("Claude provider", () => {
  it("forces a single structured tool call", () => {
    const body = buildClaudeBody(
      { promptKey: "x", system: "sys", text: "hi", schema: { type: "object" }, images: [{ mediaType: "image/png", base64: "AAA" }] },
      "claude-test"
    )
    expect(body.tool_choice).toEqual({ type: "tool", name: "answer" })
    expect(body.messages[0].content[0]).toMatchObject({ type: "image" })
    expect(body.messages[0].content[1]).toEqual({ type: "text", text: "hi" })
  })

  it("parses tool output, usage and cost", async () => {
    process.env.ANTHROPIC_API_KEY = "test"
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ model: "claude-test", content: [{ type: "tool_use", name: "answer", input: { translation: "hello" } }], usage: { input_tokens: 1000, output_tokens: 100 } }),
        { status: 200 }
      )
    ) as unknown as typeof fetch
    const p = createClaudeProvider(fetchImpl)
    const r = await p.generateJson({ promptKey: "translate", system: "s", text: "t", schema: {} })
    expect(r.data).toEqual({ translation: "hello" })
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 100 })
    expect(p.costMicroUsd(r.usage, r.model)).toBe(4500n) // 1000×3 + 100×15
  })
})

describe("mock providers", () => {
  it("AI mock returns the prompt's mock answer", async () => {
    const r = await createMockAiProvider().generateJson({
      promptKey: "translate",
      system: "s",
      text: "t",
      schema: {},
      mock: () => translatePrompt.mock({ text: "Ɛte sɛn", from: "tw", to: "en" }),
    })
    expect(translatePrompt.output.parse(r.data).translation).toContain("Ɛte sɛn")
  })

  it("speech mock transcribes every language and translates to English", async () => {
    const sp = createMockSpeechProvider()
    for (const language of ["tw", "gaa", "ee", "ha"] as const) {
      const t = await sp.transcribe({ audio: new Uint8Array(64000), mimeType: "audio/wav", language })
      const en = await sp.translate({ text: t.text, from: language, to: "en" })
      expect(t.text.length).toBeGreaterThan(5)
      expect(en).toMatch(/brake/i)
    }
  })
})

describe("Khaya", () => {
  it("only offers pairs with English", () => {
    expect(khayaPair("tw", "en")).toBe("tw-en")
    expect(khayaPair("en", "ha")).toBe("en-ha")
    expect(khayaPair("tw", "ee")).toBeNull()
    expect(khayaPair("en", "en")).toBeNull()
  })

  it("parses string and object replies", () => {
    expect(parseText('"My car"')).toBe("My car")
    expect(parseText('{"text":" hi "}')).toBe("hi")
    expect(parseText("plain")).toBe("plain")
  })

  it("posts audio with the language code", async () => {
    process.env.KHAYA_API_KEY = "k"
    const fetchImpl = vi.fn(async () => new Response('"Me kaa no"', { status: 200 })) as unknown as typeof fetch
    const r = await createKhayaProvider(fetchImpl).transcribe({ audio: new Uint8Array(10), mimeType: "audio/wav", language: "gaa" })
    expect(r.text).toBe("Me kaa no")
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain("language=gaa")
    expect((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("k")
  })
})
