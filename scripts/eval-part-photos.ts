/**
 * P8-12 evaluation: runs the part-photo prompt over a folder of labelled
 * photos and reports top-1 accuracy (target ≥ 80%).
 *
 *   npx tsx scripts/eval-part-photos.ts [tests/fixtures/part-photos]
 *
 * Needs ANTHROPIC_API_KEY in .env.local. Uses the seeded parts list
 * (no database) so the result is repeatable. Exits 1 below 80%.
 */
import { readFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { config } from "dotenv"
import { createClaudeProvider } from "../lib/integrations/ai/claude"
import { identifyPartPrompt } from "../lib/ai/prompts"
import { PART_TYPE_SEED } from "../lib/parts-catalog/seed"
import { mergeChoices, numberCandidates, sniffImageType, topOneAccuracy } from "../lib/part-photo/core"

config({ path: ".env.local" })

type Case = { file: string; expect: string; note?: string; vehicle?: string }

async function main() {
  const dir = resolve(process.argv[2] ?? "tests/fixtures/part-photos")
  const manifestPath = join(dir, "manifest.json")
  if (!existsSync(manifestPath)) throw new Error(`No manifest at ${manifestPath} — see ${join(dir, "README.md")}`)
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in .env.local")
  const { cases } = JSON.parse(readFileSync(manifestPath, "utf8")) as { cases: Case[] }
  const slugs = new Set(PART_TYPE_SEED.map((p) => p.slug))
  const usable = cases.filter((c) => existsSync(join(dir, c.file)))
  for (const c of cases) if (!slugs.has(c.expect)) console.warn(`! ${c.file}: "${c.expect}" is not a part slug`)
  if (!usable.length) throw new Error("None of the manifest's photos are in the folder yet")

  const provider = createClaudeProvider()
  const numbered = numberCandidates(PART_TYPE_SEED.map((p) => ({ id: p.slug, name: p.name, category: p.category })))
  const results: { file: string; expected: string; got: string | null; confidence: number }[] = []

  for (const c of usable) {
    const bytes = new Uint8Array(readFileSync(join(dir, c.file)))
    const mediaType = sniffImageType(bytes)
    if (!mediaType) { console.warn(`! ${c.file}: not a JPEG/PNG/WebP`); continue }
    const input = { candidates: numbered, vehicle: c.vehicle ?? null, note: c.note ?? null }
    try {
      const res = await provider.generateJson({
        promptKey: identifyPartPrompt.key,
        system: identifyPartPrompt.system,
        text: identifyPartPrompt.render(input),
        images: [{ mediaType, base64: Buffer.from(bytes).toString("base64") }],
        schema: identifyPartPrompt.jsonSchema,
        maxTokens: identifyPartPrompt.maxTokens,
      })
      const parsed = identifyPartPrompt.output.parse(res.data)
      const top = mergeChoices(numbered, parsed.choices)[0]
      results.push({ file: c.file, expected: c.expect, got: top?.id ?? null, confidence: top?.confidence ?? 0 })
    } catch (e) {
      console.warn(`! ${c.file}: ${(e as Error).message}`)
      results.push({ file: c.file, expected: c.expect, got: null, confidence: 0 })
    }
    const r = results[results.length - 1]
    console.log(`${r.got === r.expected ? "✓" : "✗"} ${r.file.padEnd(32)} expected ${r.expected.padEnd(24)} got ${String(r.got).padEnd(24)} ${Math.round(r.confidence * 100)}%`)
  }

  const acc = topOneAccuracy(results)
  console.log(`\nTop-1 accuracy: ${(acc * 100).toFixed(1)}% on ${results.length} photos (target 80%)`)
  process.exit(acc >= 0.8 ? 0 : 1)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
