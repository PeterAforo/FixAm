import "server-only"
import { db } from "@/lib/db"
import { aiCalls } from "@/lib/db/schema"
import { aiProvider, type AiImage } from "@/lib/integrations/ai"
import { minimisePii } from "./pii"
import type { PromptDef } from "./prompts"

export type AiContext = { garageId?: string | null; userId?: string | null }

export type AiRunResult<T> = { ok: true; data: T; provider: string } | { ok: false; code: "PROVIDER" | "INVALID_OUTPUT"; message: string }

/**
 * Run a registered prompt: PII-minimise → provider call → zod-validate →
 * log metadata (never content) to ai_calls. Never throws.
 */
export async function runPrompt<TInput, TOutput>(
  prompt: PromptDef<TInput, TOutput>,
  input: TInput,
  ctx: AiContext = {},
  opts: { images?: AiImage[] } = {}
): Promise<AiRunResult<TOutput>> {
  const provider = aiProvider()
  const started = Date.now()
  let model: string | null = null
  let usage = { inputTokens: 0, outputTokens: 0 }
  try {
    const res = await provider.generateJson({
      promptKey: prompt.key,
      system: prompt.system,
      text: minimisePii(prompt.render(input)),
      images: opts.images,
      schema: prompt.jsonSchema,
      maxTokens: prompt.maxTokens,
      mock: () => prompt.mock(input),
    })
    model = res.model
    usage = res.usage
    const parsed = prompt.output.safeParse(res.data)
    if (!parsed.success) {
      await logCall({ ctx, kind: "llm", provider: provider.name, model, prompt, usage, cost: provider.costMicroUsd(usage, model), status: "error", errorCode: "INVALID_OUTPUT", started })
      return { ok: false, code: "INVALID_OUTPUT", message: "The AI answer was not in the expected shape" }
    }
    await logCall({ ctx, kind: "llm", provider: provider.name, model, prompt, usage, cost: provider.costMicroUsd(usage, model), status: "ok", started })
    return { ok: true, data: parsed.data, provider: provider.name }
  } catch (e) {
    const code = (e as { code?: string }).code ?? "PROVIDER"
    await logCall({ ctx, kind: "llm", provider: provider.name, model, prompt, usage, cost: 0n, status: "error", errorCode: code, started })
    console.error(`[ai] ${prompt.key} failed:`, (e as Error).message)
    return { ok: false, code: "PROVIDER", message: "AI is unavailable right now" }
  }
}

export async function logCall(e: {
  ctx: AiContext
  kind: "llm" | "asr" | "translate"
  provider: string
  model?: string | null
  prompt?: { key: string; version: number }
  usage?: { inputTokens: number; outputTokens: number }
  audioSeconds?: number
  cost: bigint
  status: "ok" | "error"
  errorCode?: string
  started: number
}) {
  try {
    await db()
      .insert(aiCalls)
      .values({
        garageId: e.ctx.garageId ?? null,
        userId: e.ctx.userId ?? null,
        kind: e.kind,
        provider: e.provider,
        model: e.model ?? null,
        promptKey: e.prompt?.key ?? null,
        promptVersion: e.prompt?.version ?? null,
        inputTokens: e.usage?.inputTokens ?? 0,
        outputTokens: e.usage?.outputTokens ?? 0,
        audioSeconds: e.audioSeconds !== undefined ? e.audioSeconds.toFixed(2) : null,
        costMicroUsd: e.cost,
        status: e.status,
        errorCode: e.errorCode ?? null,
        latencyMs: Date.now() - e.started,
      })
  } catch (err) {
    // Logging must never break the feature.
    console.error("[ai] failed to log call:", (err as Error).message)
  }
}
