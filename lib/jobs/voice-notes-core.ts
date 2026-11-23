/** Rules-based fallback for voice job notes (used by the mock AI and in tests). */
export type JobNotesDraft = {
  findings: { title: string; description: string | null; severity: "urgent" | "recommended" | "can_wait"; recommendation: "replace" | "repair" | "monitor" }[]
  tasks: { title: string }[]
  parts: { description: string; quantity: number }[]
  labour: { description: string; hours: number }[]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function rulesJobNotes(notes: string): JobNotesDraft {
  const sentences = notes
    .split(/[.!?\n]+|\band then\b|\balso\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  const draft: JobNotesDraft = { findings: [], tasks: [], parts: [], labour: [] }
  for (const s of sentences) {
    const lower = s.toLowerCase()
    const replace = /\b(replace|change|new|worn|broken|leak|leaking|bad|finished|spoil)/.test(lower)
    if (/\b(worn|leak|leaking|broken|bad|crack|noise|loose|weak|spoil|finished)\b/.test(lower)) {
      draft.findings.push({
        title: cap(s).slice(0, 60),
        description: s.length > 60 ? s : null,
        severity: /\b(brake|steering|leak|overheat)\b/.test(lower) ? "urgent" : "recommended",
        recommendation: replace ? "replace" : "repair",
      })
    }
    const part = /\b(?:replace|change|fit|new)\s+(?:the\s+)?(?:(two|four|2|4)\s+)?([a-z ]{3,40})/.exec(lower)
    if (part) {
      const qty = part[1] ? ({ two: 2, four: 4 } as Record<string, number>)[part[1]] ?? Number(part[1]) : 1
      draft.parts.push({ description: cap(part[2]!.replace(/\b(and|then|for|on|at)\b.*$/, "").trim()), quantity: qty })
    }
    if (/\b(check|test|clean|bleed|top up|tighten|align|balance|flush)\b/.test(lower)) draft.tasks.push({ title: cap(s).slice(0, 60) })
    const hrs = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/.exec(lower)
    if (hrs) draft.labour.push({ description: cap(s.replace(hrs[0], "").trim()).slice(0, 60) || "Labour", hours: Number(hrs[1]) })
  }
  return draft
}
