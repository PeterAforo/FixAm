import Link from "next/link"
import { ArrowRight, Gauge, HeartHandshake, MapPinned, ShieldCheck, Smartphone, Sparkles } from "lucide-react"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { CtaBand, PageHero, Section, SectionIntro, ctaGlass, ctaPrimary } from "@/components/marketing/page-hero"
import { photos } from "@/lib/images"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"

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
    <main className="min-h-screen bg-background text-foreground">
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
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/signup/garage" className={ctaPrimary}>Start free trial <ArrowRight className="size-4" /></Link>
          <Link href="/contact" className={ctaGlass}>Talk to us</Link>
        </div>
      </PageHero>

      {/* Story */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionIntro eyebrow="Why we exist" title="Great mechanics, held back by notebooks." />
            <figure className="relative mt-10 aspect-[4/3] overflow-hidden rounded-[24px] shadow-[0_30px_60px_-30px_rgba(22,19,15,0.45)]">
              <PhotoImg photo={photos.mechanicEngine} fill sizes="(min-width: 1024px) 560px, 100vw" />
              <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(11,15,26,0.75)_100%)]" />
              <figcaption className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-4 text-white">
                <span className="text-sm font-medium">Skill is everywhere. Systems aren&apos;t — yet.</span>
                <PhotoCredit photo={photos.mechanicEngine} />
              </figcaption>
            </figure>
          </div>
          <div className="space-y-5 text-[17px] leading-relaxed text-muted-foreground">
            <p>
              Ghana&apos;s roads run on the skill of its mechanics. But most workshops still run on paper job cards,
              WhatsApp voice notes, memory and a cash book — and that costs them time, money and repeat customers.
            </p>
            <p>
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
          <div className="mt-14 overflow-hidden rounded-[22px] border border-border">
            <div className="grid grid-cols-2 bg-surface-muted/60 text-sm font-semibold">
              <div className="px-6 py-4 text-muted-foreground">Before FixAm</div>
              <div className="border-l border-border px-6 py-4">With FixAm</div>
            </div>
            {PROBLEMS.map((p) => (
              <div key={p.before} className="grid grid-cols-2 border-t border-border text-[15px]">
                <div className="px-6 py-5 text-muted-foreground line-through decoration-[#D3CABC]">{p.before}</div>
                <div className="flex items-start gap-2.5 border-l border-border px-6 py-5">
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
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-[22px] border border-border bg-card p-7">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-subtle text-primary"><v.icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-semibold">{v.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{v.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Who it's for */}
      <section className="bg-card">
        <Section>
          <SectionIntro eyebrow="Who FixAm is for" title="One platform, everyone in the job." />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { title: "Garage owners", text: "See revenue, jobs and money owed at a glance — from the workshop or from home.", href: "/pricing", cta: "See plans" },
              { title: "Drivers", text: "Find a trusted garage, approve work from your phone and never miss a renewal.", href: "/garages", cta: "Find a garage" },
              { title: "Parts vendors", text: "Receive orders from garages across Ghana and get paid straight to MoMo.", href: "/vendor", cta: "Sell on FixAm" },
            ].map((c) => (
              <Link key={c.title} href={c.href} className="group flex flex-col rounded-[22px] border border-border bg-background p-7 transition-colors hover:border-border-strong">
                <Smartphone className="size-5 text-muted-foreground" />
                <h3 className="mt-5 text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{c.text}</p>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold">{c.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </Section>
      </section>

      <div className="pt-24">
        <CtaBand title="Made in Accra, for every garage in Ghana." subtitle="Join us — start free for 14 days, or get in touch to see FixAm in your workshop.">
          <Link href="/signup/garage" className={ctaPrimary}>Start free trial</Link>
          <Link href="/contact" className={ctaGlass}>Contact us</Link>
        </CtaBand>
      </div>
      <SiteFooter />
    </main>
  )
}
