import Link from "next/link"
import type { ReactNode } from "react"
import { SiteFooter } from "./site-chrome"
import { PageHero } from "./page-hero"
import { LegalSectionFold } from "./legal-section"

export type LegalSection = { id: string; title: string; body: ReactNode }

/**
 * Shared layout for legal pages: hero, sticky table of contents, readable prose.
 * NOTE: the copy on these pages is a starting draft — have it reviewed by a Ghanaian
 * lawyer and fill in the [bracketed] details before launch.
 */
export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string
  intro: string
  updated: string
  sections: LegalSection[]
}) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PageHero eyebrow="Legal" title={title} subtitle={intro} />
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-8 sm:px-6 md:px-8 md:py-16 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="px-3 text-xs font-medium text-muted-foreground">On this page</p>
            <ul className="mt-2 space-y-0.5 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-card hover:text-foreground">{s.title}</a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <article className="max-w-[720px]">
          <p className="text-sm text-muted-foreground">Last updated {updated}</p>
          <div className="mt-4 border-t border-border md:mt-8 md:space-y-12 md:border-0">
            {sections.map((s, i) => (
              <LegalSectionFold key={s.id} id={s.id} index={i + 1} title={s.title}>
                {s.body}
              </LegalSectionFold>
            ))}
          </div>
          <div className="mt-8 rounded-[20px] border border-border bg-card p-5 text-sm md:mt-16 md:p-6 text-muted-foreground">
            Questions about this policy? <Link href="/contact" className="font-semibold text-foreground underline-offset-4 hover:underline">Contact us</Link> and we&apos;ll be happy to help.
          </div>
        </article>
      </div>
      <SiteFooter />
    </main>
  )
}
