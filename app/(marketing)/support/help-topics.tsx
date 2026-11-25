"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export type HelpTopicView = {
  id: string
  title: string
  summary: string
  icon: ReactNode
  faqs: { q: string; a: string }[]
}

/**
 * Topic cards + FAQ sections. On phones the cards become a swipe row of
 * tabs and only the chosen topic's questions show (or one opened by a
 * #topic link); from `md` up every topic is listed.
 */
export function HelpTopics({ topics }: { topics: HelpTopicView[] }) {
  const [active, setActive] = useState(topics[0]?.id ?? "")
  // Until a tab is tapped, a #topic link wins over the default first topic.
  const [picked, setPicked] = useState(false)
  return (
    <>
      <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {topics.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            onClick={() => {
              setActive(t.id)
              setPicked(true)
            }}
            aria-current={active === t.id ? "true" : undefined}
            className={cn(
              "group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
              "sm:block sm:whitespace-normal sm:rounded-[20px] sm:border-border sm:bg-card sm:p-5 sm:text-foreground sm:hover:border-border-strong",
              active === t.id ? "border-foreground bg-foreground text-background" : "border-border bg-card"
            )}
          >
            <span className="flex sm:size-10 sm:items-center sm:justify-center sm:rounded-xl sm:bg-primary-subtle sm:text-primary [&>svg]:size-4 sm:[&>svg]:size-5">
              {t.icon}
            </span>
            <span className="sm:mt-4 sm:block sm:text-[15px]">{t.title}</span>
            <span className="mt-1 hidden text-[13px] font-normal leading-relaxed text-muted-foreground sm:block">{t.summary}</span>
            <span className="mt-3 hidden text-xs font-medium text-muted-foreground sm:block">{t.faqs.length} articles</span>
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-10 md:mt-16 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Help topics" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {topics.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-card hover:text-foreground">{t.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-12">
          {topics.map((t) => (
            <section
              key={t.id}
              id={t.id}
              className={cn("scroll-mt-24", active !== t.id && "max-md:hidden max-md:target:block", active === t.id && !picked && "max-md:[:has(section:target)>&:not(:target)]:hidden")}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-card text-primary shadow-1 [&>svg]:size-[18px]">{t.icon}</span>
                <h2 className="font-display text-xl font-semibold tracking-[-0.02em] md:text-2xl">{t.title}</h2>
              </div>
              <div className="mt-4 overflow-hidden rounded-[20px] border border-border bg-card md:mt-5">
                {t.faqs.map((f, i) => (
                  <details key={f.q} className={cn("group", i > 0 && "border-t border-border")}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-[15px] font-medium sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted-foreground transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="px-4 pb-5 text-[15px] leading-relaxed text-muted-foreground sm:px-6 sm:pb-6">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
