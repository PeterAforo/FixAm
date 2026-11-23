import type { AiJsonResult, AiProvider } from "./types"

/**
 * Mock AI — returns the prompt's own mock answer (deterministic, no network).
 * Used when AI_PROVIDER=mock or ANTHROPIC_API_KEY is absent.
 */
export function createMockAiProvider(): AiProvider {
  return {
    name: "mock",
    async generateJson(req): Promise<AiJsonResult> {
      const data = req.mock ? req.mock() : {}
      return {
        data,
        model: "mock",
        usage: { inputTokens: Math.ceil((req.system.length + req.text.length) / 4), outputTokens: Math.ceil(JSON.stringify(data).length / 4) },
      }
    },
    costMicroUsd() {
      return 0n
    },
  }
}
