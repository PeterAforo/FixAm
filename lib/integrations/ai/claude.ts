import type { AiJsonRequest, AiJsonResult, AiProvider, AiUsage } from "./types"

/**
 * Claude (Anthropic Messages API). Structured output is obtained by forcing a
 * single tool call whose input_schema is the requested JSON Schema.
 *
 * Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (default claude-sonnet-5-5),
 * AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK in USD (defaults 3 / 15 —
 * set these to the current published price for your model).
 */

const API_URL = "https://api.anthropic.com/v1/messages"
const DEFAULT_MODEL = "claude-sonnet-5-5"

type ClaudeContent =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }

type ClaudeResponse = {
  model?: string
  content?: { type: string; name?: string; input?: unknown; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { type?: string; message?: string }
}

export class AiProviderError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "HTTP" | "NO_OUTPUT" | "INVALID_OUTPUT",
    message: string
  ) {
    super(message)
  }
}

function price(envKey: string, fallback: number): number {
  const v = Number(process.env[envKey])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export function buildClaudeBody(req: AiJsonRequest, model: string) {
  const content: ClaudeContent[] = [
    ...(req.images ?? []).map((img) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
    })),
    { type: "text", text: req.text },
  ]
  return {
    model,
    max_tokens: req.maxTokens ?? 1024,
    system: req.system,
    messages: [{ role: "user", content }],
    tools: [
      {
        name: "answer",
        description: "Return the answer as structured data.",
        input_schema: req.schema,
      },
    ],
    tool_choice: { type: "tool", name: "answer" },
  }
}

export function createClaudeProvider(fetchImpl: typeof fetch = fetch): AiProvider {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
  return {
    name: "claude",
    async generateJson(req): Promise<AiJsonResult> {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new AiProviderError("NOT_CONFIGURED", "ANTHROPIC_API_KEY is not set")
      const res = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(buildClaudeBody(req, model)),
      })
      const json = (await res.json().catch(() => ({}))) as ClaudeResponse
      if (!res.ok) {
        throw new AiProviderError("HTTP", `Claude ${res.status}: ${json.error?.message ?? res.statusText}`)
      }
      const tool = json.content?.find((c) => c.type === "tool_use" && c.name === "answer")
      if (!tool || tool.input === undefined) throw new AiProviderError("NO_OUTPUT", "Claude returned no structured answer")
      return {
        data: tool.input,
        model: json.model ?? model,
        usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
      }
    },
    costMicroUsd(usage: AiUsage): bigint {
      const inUsd = price("AI_PRICE_INPUT_PER_MTOK", 3)
      const outUsd = price("AI_PRICE_OUTPUT_PER_MTOK", 15)
      // per-MTok USD × tokens = micro-USD
      return BigInt(Math.round(usage.inputTokens * inUsd + usage.outputTokens * outUsd))
    },
  }
}
