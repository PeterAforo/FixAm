import { describe, expect, it } from "vitest"
import { rulesJobNotes } from "./voice-notes-core"
import { jobNotesPrompt } from "@/lib/ai/prompts"

describe("rulesJobNotes", () => {
  const notes = "Front brake pads worn, replace both. Brake fluid low, bleed the brakes. Rear shock leaking. About 2 hours labour."
  it("drafts findings, tasks, parts and labour", () => {
    const d = rulesJobNotes(notes)
    expect(d.findings.some((f) => /brake pads worn/i.test(f.title) && f.recommendation === "replace")).toBe(true)
    expect(d.findings.some((f) => /shock leaking/i.test(f.title))).toBe(true)
    expect(d.tasks.some((t) => /bleed/i.test(t.title))).toBe(true)
    expect(d.labour[0]?.hours).toBe(2)
  })
  it("is a valid AI-shaped draft", () => {
    expect(jobNotesPrompt.output.safeParse(rulesJobNotes(notes)).success).toBe(true)
  })
})
