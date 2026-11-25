import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { ArrowRight, BellRing, CheckCircle2, ChevronRight, Flame, MapPin, Smartphone } from "lucide-react"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { postLoginDestination } from "@/lib/auth/destination"
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome"
import {
  JobBoardWindow,
  MiniHealthRing,
  MiniStepper,
  PaymentToast,
  TrackerPhone,
} from "@/components/marketing/mockups"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"
import { AudienceTabs, PhoneShowMore } from "@/components/marketing/mobile-fold"
import { photos } from "@/lib/images"
import { cn } from "@/lib/utils"

async function AuthGate() {
  const userId = await getSessionUserId()
  if (userId) redirect(await postLoginDestination())
  return null
}

const ctaPrimary =
  "inline-flex items-center gap-2.5 rounded-full bg-[#D4430F] px-[26px] py-[15px] text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_30px_-10px_rgba(255,90,31,0.8)] transition-colors hover:bg-[#B8390A]"
const ctaGlass =
  "inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] px-6 py-[15px] text-base font-medium text-[#F4F2EE] transition-colors hover:bg-white/10"

const eyebrow = "text-[13px] font-semibold text-[#B8390A]"
const h2 = "mt-3 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-4xl md:mt-3.5 md:text-[52px]"

export default function MarketingHome() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>

      {/* ── Hero (dark) ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0B0F1A] text-[#F4F2EE]">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[360px] h-[700px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.28)_0%,rgba(255,90,31,0)_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px]"
        />

        <SiteHeader tone="dark" />

        <div className="relative mx-auto max-w-[1200px] px-5 pt-8 text-center sm:px-6 md:px-8 md:pt-[72px]">
          <Link
            href="/pricing"
            className="hidden items-center gap-2.5 rounded-full border border-white/10 sm:inline-flex bg-white/[0.06] py-1.5 pl-1.5 pr-3.5 text-[13px] text-[#D6DAE6] transition-colors hover:bg-white/10"
          >
            <span className="rounded-full bg-[#C6F432]/15 px-2.5 py-0.5 text-xs font-semibold text-[#D9F76F]">New</span>
            Insurance &amp; DVLA renewals, handled by your garage
            <ChevronRight className="size-3.5" />
          </Link>
          <h1 className="mx-auto max-w-[940px] font-display text-[40px] sm:mt-7 sm:text-5xl font-bold leading-none tracking-[-0.035em] md:text-[76px]">
            Run your garage.
            <br />
            <span className="bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_55%,#FF7A3D_100%)] bg-clip-text text-transparent">
              Keep every customer.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-[640px] text-base leading-relaxed text-[#AEB5C8] sm:mt-6 sm:text-lg md:text-[19px]">
            Check-ins, estimates, parts, MoMo payments and automatic oil, insurance and DVLA reminders — one calm
            system for Ghanaian workshops, and a live tracker their drivers love.
          </p>
          <div className="mx-auto mt-7 flex max-w-[360px] sm:mt-9 flex-col justify-center gap-3 sm:max-w-none sm:flex-row sm:flex-wrap">
            <Link href="/signup/garage" className={`${ctaPrimary} justify-center`}>
              Start free trial <ArrowRight className="size-4" />
            </Link>
            <Link href="/garages" className={`${ctaGlass} justify-center`}>
              <MapPin className="size-4" /> Find a garage near you
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-[#8A93AB] sm:mt-[18px]">14-day free trial · No card needed · Set up in under 10 minutes</p>
        </div>

        {/* Product composite */}
        <div className="relative mx-auto mt-10 max-w-[1200px] px-5 sm:px-6 md:mt-16 md:px-8">
          {/* Phones get a short peek of the job board, faded out. */}
          <div className="relative max-h-[240px] overflow-hidden sm:max-h-none">
            <JobBoardWindow />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(11,15,26,0)_0%,#0B0F1A_100%)] sm:hidden" />
          </div>
          <TrackerPhone className="absolute -right-2 top-[70px] hidden xl:block" />
          <PaymentToast className="absolute bottom-12 left-0 hidden md:flex" />
        </div>
      </section>

      {/* ── Proof strip ─────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-5 sm:gap-6 sm:px-6 md:px-8 md:py-7">
          <p className="text-[13px] text-muted-foreground sm:text-sm">
            Built in Accra for Ghanaian workshops and the drivers who trust them
          </p>
          <div className="-mx-5 flex w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 text-[13px] font-medium text-[#3F3A34] [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:gap-2.5 sm:overflow-visible sm:px-0">
            {["MTN MoMo", "Telecel Cash", "AirtelTigo Money", "Visa & Mastercard", "WhatsApp & SMS"].map((c) => (
              <span key={c} className="shrink-0 whitespace-nowrap rounded-full bg-[#F4F0EA] px-3.5 py-[7px]">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── On the workshop floor (photography) ─────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-5 pt-12 sm:px-6 md:px-8 md:pt-[120px]">
        {/* Phones: swipe through the three photos instead of stacking them. */}
        <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-12 md:grid-rows-[260px_260px] md:gap-5 md:overflow-visible md:px-0">
          <figure className="group relative h-[340px] w-[86%] shrink-0 snap-center overflow-hidden rounded-[24px] md:col-span-7 md:row-span-2 md:h-auto md:min-h-[380px] md:w-auto md:rounded-[28px]">
            <PhotoImg photo={photos.accraWorkshop} fill sizes="(min-width: 768px) 700px, 100vw" className="transition-transform duration-700 group-hover:scale-[1.03]" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.1)_30%,rgba(11,15,26,0.85)_100%)]" />
            <div className="absolute left-5 top-5 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-[#0B0F1A]/70 px-3.5 py-2.5 text-white backdrop-blur-md">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#C6F432] text-[#0B0F1A]"><CheckCircle2 className="size-4" /></span>
              <span className="text-sm"><strong className="font-semibold">Bay 2</strong> · Ready for pickup</span>
            </div>
            <figcaption className="absolute inset-x-5 bottom-5 text-white md:inset-x-8 md:bottom-8">
              <p className="text-[13px] font-semibold text-[#FF8A57]">Made on the workshop floor</p>
              <p className="mt-2 max-w-[460px] font-display text-2xl font-bold leading-[1.1] tracking-[-0.02em] md:text-[34px]">
                Designed with Accra mechanics, for real bays — not boardrooms.
              </p>
              <PhotoCredit photo={photos.accraWorkshop} className="mt-3 inline-block" />
            </figcaption>
          </figure>
          <figure className="group relative h-[340px] w-[86%] shrink-0 snap-center overflow-hidden rounded-[24px] md:col-span-5 md:h-auto md:min-h-[240px] md:w-auto md:rounded-[28px]">
            <PhotoImg photo={photos.oilChange} fill sizes="(min-width: 768px) 480px, 100vw" className="transition-transform duration-700 group-hover:scale-[1.03]" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,15,26,0.8)_0%,rgba(11,15,26,0.1)_75%)]" />
            <figcaption className="absolute inset-y-0 left-6 flex max-w-[260px] flex-col justify-center text-white">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><BellRing className="size-5" /></span>
              <p className="mt-3 font-display text-xl font-semibold leading-tight">Oil reminders timed to how they actually drive.</p>
            </figcaption>
            <PhotoCredit photo={photos.oilChange} className="absolute bottom-3 right-4" />
          </figure>
          <figure className="group relative h-[340px] w-[86%] shrink-0 snap-center overflow-hidden rounded-[24px] md:col-span-5 md:h-auto md:min-h-[240px] md:w-auto md:rounded-[28px]">
            <PhotoImg photo={photos.suvGarage} fill sizes="(min-width: 768px) 480px, 100vw" className="transition-transform duration-700 group-hover:scale-[1.03]" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,15,26,0.8)_0%,rgba(11,15,26,0.1)_75%)]" />
            <figcaption className="absolute inset-y-0 left-6 flex max-w-[260px] flex-col justify-center text-white">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><Smartphone className="size-5" /></span>
              <p className="mt-3 font-display text-xl font-semibold leading-tight">Drivers watch the job live — and approve from WhatsApp.</p>
            </figcaption>
            <PhotoCredit photo={photos.suvGarage} className="absolute bottom-3 right-4" />
          </figure>
        </div>
      </section>

      {/* ── Two sides ───────────────────────────────────────────────── */}
      <section id="drivers" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-4 pt-12 sm:px-6 md:px-8 md:pb-10 md:pt-[120px]">
        <div className="max-w-[720px]">
          <div className={eyebrow}>One platform, two sides</div>
          <h2 className={h2}>The workshop runs smoother. Drivers come back.</h2>
        </div>
        <AudienceTabs
          className="mt-6 md:mt-14"
          tabs={[
            {
              label: "For garages",
              panel: (
          <article className="flex w-full flex-col gap-5 overflow-hidden rounded-[24px] bg-[#0B0F1A] p-6 text-[#F4F2EE] md:gap-7 md:rounded-[28px] md:p-10">
            <div>
              <div className="text-[13px] font-semibold text-[#FF8A57]">For garages</div>
              <h3 className="mt-2 font-display text-2xl font-semibold leading-[1.1] md:mt-2.5 md:text-[32px]">Front desk to finance, without the notebook.</h3>
            </div>
            <ul className="flex flex-col gap-3.5 text-[15px] text-[#C3C9D8]">
              {[
                "Two-minute check-in with photos, odometer and signature",
                "Estimates customers approve line by line from WhatsApp",
                "MoMo, cards, deposits, instalments and credit accounts",
              ].map((t) => (
                <li key={t} className="flex gap-3"><span className="text-[#C6F432]">—</span>{t}</li>
              ))}
            </ul>
            <div className="mt-auto grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-white/[0.08] bg-[#121A2E] p-3 sm:p-4"><div className="text-xs text-[#8A93AB]">In the bays</div><div className="mt-1.5 font-display text-3xl font-bold">7</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#121A2E] p-3 sm:p-4"><div className="text-xs text-[#8A93AB]">Ready</div><div className="mt-1.5 font-display text-3xl font-bold text-[#D9F76F]">2</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#121A2E] p-3 sm:p-4"><div className="text-xs text-[#8A93AB]">Collected today</div><div className="mt-2.5 whitespace-nowrap font-display text-lg font-bold tabular-nums sm:text-xl">GH₵ 4,860</div></div>
            </div>
            <Link href="/signup/garage" className="inline-flex items-center gap-2 text-[15px] font-semibold text-white">Open your garage <ArrowRight className="size-4" /></Link>
          </article>
              ),
            },
            {
              label: "For drivers",
              panel: (

          <article className="flex w-full flex-col gap-5 rounded-[24px] border border-border bg-card p-6 shadow-1 md:gap-7 md:rounded-[28px] md:p-10">
            <div>
              <div className={eyebrow}>For drivers</div>
              <h3 className="mt-2 font-display text-2xl font-semibold leading-[1.1] md:mt-2.5 md:text-[32px]">Your car&apos;s whole life, in your pocket.</h3>
            </div>
            <ul className="flex flex-col gap-3.5 text-[15px] text-muted-foreground">
              {[
                "Track repairs live and approve work with one tap",
                "Reminders before oil, insurance or roadworthy run out",
                "No app store — your phone number is your account",
              ].map((t) => (
                <li key={t} className="flex gap-3"><span className="text-[#E8470F]">—</span>{t}</li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-5 rounded-[20px] border border-border bg-background p-5">
              <div className="min-w-[160px] flex-1">
                <span className="rounded-md border-[1.5px] border-foreground bg-white px-2 py-0.5 font-mono text-xs font-semibold">GR 1234-24</span>
                <div className="mt-2.5 text-[15px] font-semibold">Toyota Corolla · 2016</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">Care score <strong className="text-foreground">86</strong> / 100</div>
              </div>
              <div className="flex gap-3.5">
                <MiniHealthRing label="Oil" value="OK" pct={82} tone="ok" />
                <MiniHealthRing label="Insurance" value="17d" pct={25} tone="warn" />
                <MiniHealthRing label="DVLA" value="OK" pct={70} tone="ok" />
              </div>
            </div>
            <div className="flex flex-wrap gap-5 text-[15px] font-semibold">
              <Link href="/portal" className="inline-flex items-center gap-2">Open my portal <ArrowRight className="size-4" /></Link>
              <Link href="/garages" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">Search garages <ArrowRight className="size-4" /></Link>
            </div>
          </article>
              ),
            },
          ]}
        />
      </section>

      {/* ── Bento features ──────────────────────────────────────────── */}
      <section id="product" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-4 pt-12 sm:px-6 md:px-8 md:pb-10 md:pt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <div className={eyebrow}>Everything in one place</div>
            <h2 className={h2}>Built for how Ghanaian workshops actually run.</h2>
          </div>
          <p className="hidden max-w-[360px] text-base leading-relaxed text-muted-foreground md:block">
            Works on a mid-range Android, keeps going when the network drops, and talks to customers where they already are.
          </p>
        </div>

        <PhoneShowMore className="mt-6 grid gap-4 md:mt-14 md:grid-cols-3 md:gap-5">
          <article id="payments" className="flex flex-wrap gap-6 rounded-3xl border border-border bg-card p-6 md:col-span-2 md:min-h-[300px] md:gap-8 md:p-8">
            <div className="min-w-0 flex-[1_1_240px]">
              <h3 className="font-display text-xl font-semibold md:text-2xl">Get paid the way Ghana pays</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                Send a pay link and the customer approves the MoMo prompt on their phone. Deposits, instalments and credit
                accounts all reconcile on their own.
              </p>
            </div>
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
              <div className="rounded-[18px] bg-[linear-gradient(135deg,#FF7A3D,#D4430F)] p-5 text-white shadow-[0_16px_40px_-16px_rgba(212,67,15,0.7)]">
                <div className="text-xs opacity-85">Collected this month</div>
                <div className="mt-1.5 font-display text-3xl font-bold tabular-nums sm:text-4xl"><span className="mr-1 align-[10px] text-lg">GH₵</span>48,920.00</div>
                <div className="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-xs">Sample figures</div>
              </div>
              <div className="flex items-center justify-between rounded-[14px] border border-border px-3.5 py-3 text-sm"><span>Abena O. · INV-SPX-000231</span><span className="font-semibold text-[#4E6B07]">+ GH₵ 450.00</span></div>
              <div className="flex items-center justify-between rounded-[14px] border border-border px-3.5 py-3 text-sm"><span>Swift Logistics · on account</span><span className="font-semibold text-[#0B6B66]">GH₵ 3,200.00</span></div>
            </div>
          </article>

          <article id="reminders" className="flex flex-col gap-5 rounded-3xl bg-[#0B0F1A] p-6 text-[#F4F2EE] md:p-8">
            <h3 className="font-display text-xl font-semibold md:text-2xl">Reminders that bring them back</h3>
            <div className="mt-auto flex flex-col gap-2">
              <div className="max-w-[92%] self-start rounded-[16px_16px_16px_4px] bg-[#1F2A44] px-3.5 py-3 text-[13px] leading-snug text-[#E3E7F0]">
                Hi Abena, your GR 1234-24 insurance expires on <strong>9 Dec</strong>. Let Pitstop renew it for you — no queues.
              </div>
              <div className="self-start rounded-full bg-[#C6F432] px-3.5 py-2 text-xs font-semibold text-[#0B0F1A]">Renew with my garage</div>
              <div className="self-end rounded-[16px_16px_4px_16px] bg-[#D4430F] px-3.5 py-2.5 text-[13px]">Yes please, renew it</div>
            </div>
          </article>

          <article className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:gap-5 md:p-8">
            <h3 className="font-display text-xl font-semibold md:text-2xl">Insurance &amp; DVLA, handled</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Collect documents, quote, take payment and track every renewal to done.</p>
            <div className="mt-auto">
              <MiniStepper
                steps={[
                  { label: "Documents received", state: "done" },
                  { label: "Quote paid · GH₵ 3,450", state: "done" },
                  { label: "Processing with insurer", state: "current" },
                  { label: "New policy delivered", state: "todo" },
                ]}
              />
            </div>
          </article>

          <article className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:gap-5 md:p-8">
            <h3 className="font-display text-xl font-semibold md:text-2xl">A mechanic app they enjoy</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Big buttons, timers, photo findings — and it works offline in the bay.</p>
            <div className="mt-auto flex items-center gap-3.5 rounded-2xl bg-[#0B0F1A] px-4 py-3.5 text-[#F4F2EE]">
              <Flame className="size-7 text-[#FF7A3D]" />
              <div><div className="text-[15px] font-semibold">5-day streak</div><div className="text-xs text-[#9AA3BC]">Clean Sheet badge unlocked</div></div>
            </div>
          </article>

          <article className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:gap-5 md:p-8">
            <h3 className="font-display text-xl font-semibold md:text-2xl">Parts that reorder themselves</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Low on filters? FixAm drafts the order with your vendor and tracks delivery.</p>
            <div className="mt-auto flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3.5">
              <div><div className="text-sm font-semibold">24 × Oil filter (Toyota)</div><div className="mt-0.5 text-xs text-muted-foreground">Accra Auto Supplies</div></div>
              <span className="whitespace-nowrap rounded-full bg-[#E3F9F7] px-2.5 py-1 text-xs font-semibold text-[#0B6B66]">Arrives 2 pm</span>
            </div>
          </article>
        </PhoneShowMore>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-6 md:px-8 md:py-24">
        <div className="max-w-[640px] md:mx-auto md:text-center">
          <div className={eyebrow}>How it works</div>
          <h2 className={h2}>From gate to payment in three steps.</h2>
        </div>
        <div className="relative mt-6 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-10">
          <div aria-hidden className="absolute left-[16%] right-[16%] top-[27px] hidden h-0.5 bg-[repeating-linear-gradient(90deg,#E2DACE_0_8px,transparent_8px_16px)] md:block" />
          {[
            { n: "1", t: "Book or drive in", d: "Online booking or walk-in. The front desk checks the car in under two minutes, photos included." },
            { n: "2", t: "Approve, fix, track", d: "The driver approves the estimate on WhatsApp and watches progress live while the team works." },
            { n: "3", t: "Pay and come back", d: "MoMo payment, instant receipt — then FixAm reminds them before the next service is due." },
          ].map((s, i) => (
            <div key={s.n} className="relative flex items-start gap-4 md:flex-col md:items-center md:gap-3.5 md:text-center">
              <span
                className={
                  i === 2
                    ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-[#D4430F] font-display text-base md:size-14 md:text-xl font-bold text-white shadow-[0_10px_24px_-8px_rgba(212,67,15,0.6)]"
                    : "flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card font-display text-base md:size-14 md:text-xl font-bold text-[#D4430F] shadow-2"
                }
              >
                {s.n}
              </span>
              <div>
                <h3 className="text-base font-semibold md:mt-1.5 md:text-lg">{s.t}</h3>
                <p className="mt-1 max-w-[300px] text-sm leading-relaxed text-muted-foreground md:mx-auto md:mt-3.5 md:text-[15px]">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="px-4 pb-12 sm:px-6 md:px-8 md:pb-24">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-[#0B0F1A] px-5 py-12 text-center text-[#F4F2EE] sm:px-6 md:rounded-[32px] md:py-[88px]">
          <PhotoImg photo={photos.accraCity} fill sizes="1200px" className="opacity-40" />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.75),rgba(11,15,26,0.9))]" />
          <div aria-hidden className="absolute -bottom-[260px] left-1/2 h-[520px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.35)_0%,rgba(255,90,31,0)_100%)]" />
          <h2 className="relative font-display text-[32px] font-bold leading-[1.04] tracking-[-0.035em] sm:text-4xl md:text-6xl">Ready to FixAm your garage?</h2>
          <p className="relative mx-auto mt-3 max-w-[520px] text-base text-[#AEB5C8] md:mt-[18px] md:text-lg">
            Start free for 14 days. We&apos;ll help you import your customers and parts.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3 md:mt-[34px]">
            <Link href="/signup/garage" className={ctaPrimary}>Start free trial</Link>
            <Link href="/garages" className={cn(ctaGlass, "hidden sm:inline-flex")}>Browse garages</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
