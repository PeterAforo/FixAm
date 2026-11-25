import Link from "next/link"
import { ArrowRight, Gauge, HeartHandshake, MapPinned, ShieldCheck, Smartphone, Sparkles } from "lucide-react"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { CtaBand, PageHero, Section, SectionIntro, ctaGlass, ctaPrimary } from "@/components/marketing/page-hero"
import { photos } from "@/lib/images"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "About us",
  description: "FixAm is building the operating system for Ghanaian garages — and a better experience for the drivers who trust them.",
}

const VALUES = [
  { icon: MapPinned, title: "Built for Ghana first", text: "Mobile Money, WhatsApp, DVLA renewals, GH₵ and patchy networks aren't edge cases for us — they're the starting point." },
  { icon: HeartHandshake, title: "Trust on both sides", text: "Drivers see photos, prices and progress before they pay. Garages get paid on time and keep their customers coming back." },
  { icon: Gauge, title: "Fast beats fancy", text: "Every screen has to work on a mid-range Android in a busy workshop. If it slows a mechanic down, it doesn't ship." },
  { icon: ShieldCheck, title: "Your data stays yours", text: "Each garage only ever sees its own customers. We follow Ghana's Data Protection Act and never sell personal data." },
]

const PROBLEMS = [
  { before: "Paper job cards that get lost or smudged", after: "A two-minute digital check-in with photos and a signature" },
  { before: "Estimates agreed over the phone, disputed later", after: "Line-by-line approval from WhatsApp, recorded and signed" },
  { before: "Cash books and chasing payments", after: "MoMo pay links, receipts and instalments that reconcile themselves" },
  { before: "Customers who forget and never come back", after: "Automatic oil, insurance and DVLA reminders that bring them back" },
]

export default function AboutPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PageHero
        image={photos.accraCity}
        active="About"
        eyebrow="About FixAm"
        title={
          <>
            Every garage deserves the tools of the <span className="bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_60%)] bg-clip-text text-transparent">best workshops</span>
          </>
        }
        subtitle="We're building the operating system for Ghanaian garages — and a calmer, more transparent experience for the drivers who trust them."
      >
        <div className="mt-7 flex flex-wrap justify-center gap-3 md:mt-9">
          <Link href="/signup/garage" className={ctaPrimary}>Start free trial <ArrowRight className="size-4" /></Link>
          <Link href="/contact" className={cn(ctaGlass, "hidden sm:inline-flex")}>Talk to us</Link>
        </div>
      </PageHero>

      {/* Story */}
      <Section>
        <div className="grid gap-5 md:gap-12 lg:grid-cols-2">
          <div>
            <SectionIntro eyebrow="Why we exist" title="Great mechanics, held back by notebooks." />
            <figure className="relative mt-10 hidden aspect-[4/3] sm:block overflow-hidden rounded-[24px] shadow-[0_30px_60px_-30px_rgba(22,19,15,0.45)]">
              <PhotoImg photo={photos.mechanicEngine} fill sizes="(min-width: 1024px) 560px, 100vw" />
              <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(11,15,26,0.75)_100%)]" />
              <figcaption className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-4 text-white">
                <span className="text-sm font-medium">Skill is everywhere. Systems aren&apos;t — yet.</span>
                <PhotoCredit photo={photos.mechanicEngine} />
              </figcaption>
            </figure>
          </div>
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground md:space-y-5 md:text-[17px]">
            <p>
              Ghana&apos;s roads run on the skill of its mechanics. But most workshops still run on paper job cards,
              WhatsApp voice notes, memory and a cash book — and that costs them time, money and repeat customers.
            </p>
            <p className="hidden sm:block">
              Drivers feel it too. They rarely know what&apos;s wrong with their car until the bill arrives, they forget
              oil changes, and they get caught out by an expired roadworthy or insurance sticker.
            </p>
            <p className="text-foreground">
              FixAm brings the whole job into one place — check-in, estimates, parts, payments and reminders — so garages
              can run like the best workshops in the world, and drivers always know where they stand.
            </p>
          </div>
        </div>
      </Section>

      {/* Before / after */}
      <section className="bg-card">
        <Section>
          <SectionIntro center eyebrow="What changes" title="From guesswork to a workshop that runs itself." />
          <div className="mt-6 overflow-hidden rounded-[22px] border border-border md:mt-14">
            <div className="hidden grid-cols-2 bg-surface-muted/60 text-sm font-semibold sm:grid">
              <div className="px-6 py-4 text-muted-foreground">Before FixAm</div>
              <div className="border-l border-border px-6 py-4">With FixAm</div>
            </div>
            {PROBLEMS.map((p) => (
              <div key={p.before} className="grid border-t border-border text-[15px] max-sm:[&:nth-child(2)]:border-t-0 sm:grid-cols-2">
                <div className="px-4 pt-4 text-[13px] text-muted-foreground line-through decoration-[#D3CABC] sm:px-6 sm:py-5 sm:text-[15px]">{p.before}</div>
                <div className="flex items-start gap-2.5 px-4 pb-4 pt-1.5 sm:border-l sm:border-border sm:px-6 sm:py-5">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#D4430F]" />
                  {p.after}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </section>

      {/* Values */}
      <Section>
        <SectionIntro eyebrow="What we believe" title="The principles behind every screen." />
        <div className="-mx-5 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0">
          {VALUES.map((v) => (
            <div key={v.title} className="w-[80%] shrink-0 snap-center rounded-[22px] border border-border bg-card p-5 sm:w-auto sm:p-7">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-subtle text-primary sm:size-11"><v.icon className="size-5" /></span>
              <h3 className="mt-4 text-lg font-semibold sm:mt-5">{v.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{v.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Who it's for */}
      <section className="bg-card">
        <Section>
          <SectionIntro eyebrow="Who FixAm is for" title="One platform, everyone in the job." />
          <div className="mt-6 grid gap-3 md:mt-12 md:grid-cols-3 md:gap-5">
            {[
              { title: "Garage owners", text: "See revenue, jobs and money owed at a glance — from the workshop or from home.", href: "/pricing", cta: "See plans" },
              { title: "Drivers", text: "Find a trusted garage, approve work from your phone and never miss a renewal.", href: "/garages", cta: "Find a garage" },
              { title: "Parts vendors", text: "Receive orders from garages across Ghana and get paid straight to MoMo.", href: "/vendor", cta: "Sell on FixAm" },
            ].map((c) => (
              <Link key={c.title} href={c.href} className="group flex flex-col rounded-[22px] border border-border bg-background p-5 transition-colors hover:border-border-strong md:p-7">
                <Smartphone className="hidden size-5 text-muted-foreground md:block" />
                <h3 className="text-lg font-semibold md:mt-5">{c.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground md:mt-2 md:text-[15px]">{c.text}</p>
                <span className="mt-3 inline-flex md:mt-6 items-center gap-1 text-sm font-semibold">{c.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </Section>
      </section>

      <div className="pt-12 md:pt-24">
        <CtaBand title="Made in Accra, for every garage in Ghana." subtitle="Join us — start free for 14 days, or get in touch to see FixAm in your workshop.">
          <Link href="/signup/garage" className={ctaPrimary}>Start free trial</Link>
          <Link href="/contact" className={cn(ctaGlass, "hidden sm:inline-flex")}>Contact us</Link>
        </CtaBand>
      </div>
      <SiteFooter />
    </main>
  )
}
