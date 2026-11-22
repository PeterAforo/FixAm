import Link from "next/link"
import type { ReactNode } from "react"
import { SiteFooter } from "./site-chrome"
import { PageHero } from "./page-hero"

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
    <main className="min-h-screen bg-background text-foreground">
      <PageHero eyebrow="Legal" title={title} subtitle={intro} />
      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-16 md:px-8 lg:grid-cols-[240px_minmax(0,1fr)]">
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
          <div className="mt-8 space-y-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className="mt-4 space-y-4 text-[16px] leading-[1.75] text-[#3F3A34] [&_a]:font-medium [&_a]:text-[#B8390A] [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-16 rounded-[20px] border border-border bg-card p-6 text-sm text-muted-foreground">
            Questions about this policy? <Link href="/contact" className="font-semibold text-foreground underline-offset-4 hover:underline">Contact us</Link> and we&apos;ll be happy to help.
          </div>
        </article>
      </div>
      <SiteFooter />
    </main>
  )
}
