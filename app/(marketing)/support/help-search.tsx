"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

export type HelpTopic = {
  id: string
  title: string
  summary: string
  faqs: { q: string; a: string }[]
}

/** Instant client-side search across help articles. */
export function HelpSearch({ topics }: { topics: HelpTopic[] }) {
  const [term, setTerm] = useState("")
  const results = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (t.length < 2) return []
    return topics
      .flatMap((topic) => topic.faqs.map((f) => ({ ...f, topic })))
      .filter((f) => f.q.toLowerCase().includes(t) || f.a.toLowerCase().includes(t))
      .slice(0, 6)
  }, [term, topics])

  return (
    <div className="relative z-10 -mt-16">
      <div className="rounded-[22px] border border-border bg-card p-3 shadow-[0_30px_60px_-30px_rgba(11,15,26,0.45)]">
        <label className="relative block">
          <span className="sr-only">Search the help centre</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search for answers — e.g. “pay link”, “reminders”, “invite staff”"
            className="h-14 w-full rounded-[14px] border border-transparent bg-background pl-12 pr-4 text-base outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
          />
        </label>
        {term.trim().length >= 2 && (
          <div className="mt-2 border-t border-border-subtle pt-2" aria-live="polite">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No articles match “{term.trim()}”. Try another word, or contact us below.</p>
            ) : (
              <ul>
                {results.map((r) => (
                  <li key={r.q}>
                    <a href={`#${r.topic.id}`} className="block rounded-xl px-3 py-3 hover:bg-background">
                      <span className="block text-[15px] font-medium">{r.q}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{r.topic.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
