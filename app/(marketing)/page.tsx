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
import { photos } from "@/lib/images"

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
const h2 = "mt-3.5 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] md:text-[52px]"

export default function MarketingHome() {
  return (
    <main className="min-h-screen bg-background text-foreground">
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

        <div className="relative mx-auto max-w-[1200px] px-6 pt-14 text-center md:px-8 md:pt-[72px]">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3.5 text-[13px] text-[#D6DAE6] transition-colors hover:bg-white/10"
          >
            <span className="rounded-full bg-[#C6F432]/15 px-2.5 py-0.5 text-xs font-semibold text-[#D9F76F]">New</span>
            Insurance &amp; DVLA renewals, handled by your garage
            <ChevronRight className="size-3.5" />
          </Link>
          <h1 className="mx-auto mt-7 max-w-[940px] font-display text-5xl font-bold leading-none tracking-[-0.035em] md:text-[76px]">
            Run your garage.
            <br />
            <span className="bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_55%,#FF7A3D_100%)] bg-clip-text text-transparent">
              Keep every customer.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-[640px] text-lg leading-relaxed text-[#AEB5C8] md:text-[19px]">
            Check-ins, estimates, parts, MoMo payments and automatic oil, insurance and DVLA reminders — one calm
            system for Ghanaian workshops, and a live tracker their drivers love.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding" className={ctaPrimary}>
              Start free trial <ArrowRight className="size-4" />
            </Link>
            <Link href="/garages" className={ctaGlass}>
              <MapPin className="size-4" /> Find a garage near you
            </Link>
          </div>
          <p className="mt-[18px] text-[13px] text-[#8A93AB]">14-day free trial · No card needed · Set up in under 10 minutes</p>
        </div>

        {/* Product composite */}
        <div className="relative mx-auto mt-16 max-w-[1200px] px-6 md:px-8">
          <JobBoardWindow />
          <TrackerPhone className="absolute -right-2 top-[70px] hidden xl:block" />
          <PaymentToast className="absolute bottom-12 left-0 hidden md:flex" />
        </div>
      </section>

      {/* ── Proof strip ─────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-7 md:px-8">
          <p className="text-sm text-muted-foreground">
            Built in Accra for Ghanaian workshops and the drivers who trust them
          </p>
          <div className="flex flex-wrap gap-2.5 text-[13px] font-medium text-[#3F3A34]">
            {["MTN MoMo", "Telecel Cash", "AirtelTigo Money", "Visa & Mastercard", "WhatsApp & SMS"].map((c) => (
              <span key={c} className="rounded-full bg-[#F4F0EA] px-3.5 py-[7px]">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── On the workshop floor (photography) ─────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-6 pt-24 md:px-8 md:pt-[120px]">
        <div className="grid gap-5 md:grid-cols-12 md:grid-rows-[260px_260px]">
          <figure className="group relative overflow-hidden rounded-[28px] md:col-span-7 md:row-span-2 min-h-[380px]">
            <PhotoImg photo={photos.accraWorkshop} fill sizes="(min-width: 768px) 700px, 100vw" className="transition-transform duration-700 group-hover:scale-[1.03]" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.1)_30%,rgba(11,15,26,0.85)_100%)]" />
            <div className="absolute left-5 top-5 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-[#0B0F1A]/70 px-3.5 py-2.5 text-white backdrop-blur-md">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#C6F432] text-[#0B0F1A]"><CheckCircle2 className="size-4" /></span>
              <span className="text-sm"><strong className="font-semibold">Bay 2</strong> · Ready for pickup</span>
            </div>
            <figcaption className="absolute inset-x-6 bottom-6 text-white md:inset-x-8 md:bottom-8">
              <p className="text-[13px] font-semibold text-[#FF8A57]">Made on the workshop floor</p>
              <p className="mt-2 max-w-[460px] font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[34px]">
                Designed with Accra mechanics, for real bays — not boardrooms.
              </p>
              <PhotoCredit photo={photos.accraWorkshop} className="mt-3 inline-block" />
            </figcaption>
          </figure>
          <figure className="group relative min-h-[240px] overflow-hidden rounded-[28px] md:col-span-5">
            <PhotoImg photo={photos.oilChange} fill sizes="(min-width: 768px) 480px, 100vw" className="transition-transform duration-700 group-hover:scale-[1.03]" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,15,26,0.8)_0%,rgba(11,15,26,0.1)_75%)]" />
            <figcaption className="absolute inset-y-0 left-6 flex max-w-[260px] flex-col justify-center text-white">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><BellRing className="size-5" /></span>
              <p className="mt-3 font-display text-xl font-semibold leading-tight">Oil reminders timed to how they actually drive.</p>
            </figcaption>
            <PhotoCredit photo={photos.oilChange} className="absolute bottom-3 right-4" />
          </figure>
          <figure className="group relative min-h-[240px] overflow-hidden rounded-[28px] md:col-span-5">
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
      <section id="drivers" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 pb-10 pt-24 md:px-8 md:pt-[120px]">
        <div className="max-w-[720px]">
          <div className={eyebrow}>One platform, two sides</div>
          <h2 className={h2}>The workshop runs smoother. Drivers come back.</h2>
        </div>
        <div className="mt-14 flex flex-wrap gap-6">
          <article className="flex min-w-0 flex-[1_1_480px] flex-col gap-7 overflow-hidden rounded-[28px] bg-[#0B0F1A] p-8 text-[#F4F2EE] md:p-10">
            <div>
              <div className="text-[13px] font-semibold text-[#FF8A57]">For garages</div>
              <h3 className="mt-2.5 font-display text-[32px] font-semibold leading-[1.1]">Front desk to finance, without the notebook.</h3>
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
              <div className="rounded-2xl border border-white/[0.08] bg-[#121A2E] p-4"><div className="text-xs text-[#8A93AB]">In the bays</div><div className="mt-1.5 font-display text-3xl font-bold">7</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#121A2E] p-4"><div className="text-xs text-[#8A93AB]">Ready</div><div className="mt-1.5 font-display text-3xl font-bold text-[#D9F76F]">2</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#121A2E] p-4"><div className="text-xs text-[#8A93AB]">Collected today</div><div className="mt-2.5 font-display text-xl font-bold tabular-nums">GH₵ 4,860</div></div>
            </div>
            <Link href="/onboarding" className="inline-flex items-center gap-2 text-[15px] font-semibold text-white">Open your garage <ArrowRight className="size-4" /></Link>
          </article>

          <article className="flex min-w-0 flex-[1_1_480px] flex-col gap-7 rounded-[28px] border border-border bg-card p-8 shadow-1 md:p-10">
            <div>
              <div className={eyebrow}>For drivers</div>
              <h3 className="mt-2.5 font-display text-[32px] font-semibold leading-[1.1]">Your car&apos;s whole life, in your pocket.</h3>
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
        </div>
      </section>

      {/* ── Bento features ──────────────────────────────────────────── */}
      <section id="product" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 pb-10 pt-24 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <div className={eyebrow}>Everything in one place</div>
            <h2 className={h2}>Built for how Ghanaian workshops actually run.</h2>
          </div>
          <p className="max-w-[360px] text-base leading-relaxed text-muted-foreground">
            Works on a mid-range Android, keeps going when the network drops, and talks to customers where they already are.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          <article id="payments" className="flex min-h-[300px] flex-wrap gap-8 rounded-3xl border border-border bg-card p-8 md:col-span-2">
            <div className="min-w-[240px] flex-1">
              <h3 className="font-display text-2xl font-semibold">Get paid the way Ghana pays</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                Send a pay link and the customer approves the MoMo prompt on their phone. Deposits, instalments and credit
                accounts all reconcile on their own.
              </p>
            </div>
            <div className="flex min-w-[260px] flex-1 flex-col gap-2.5">
              <div className="rounded-[18px] bg-[linear-gradient(135deg,#FF7A3D,#D4430F)] p-5 text-white shadow-[0_16px_40px_-16px_rgba(212,67,15,0.7)]">
                <div className="text-xs opacity-85">Collected this month</div>
                <div className="mt-1.5 font-display text-4xl font-bold tabular-nums"><span className="mr-1 align-[10px] text-lg">GH₵</span>48,920.00</div>
                <div className="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-xs">Sample figures</div>
              </div>
              <div className="flex items-center justify-between rounded-[14px] border border-border px-3.5 py-3 text-sm"><span>Abena O. · INV-SPX-000231</span><span className="font-semibold text-[#4E6B07]">+ GH₵ 450.00</span></div>
              <div className="flex items-center justify-between rounded-[14px] border border-border px-3.5 py-3 text-sm"><span>Swift Logistics · on account</span><span className="font-semibold text-[#0B6B66]">GH₵ 3,200.00</span></div>
            </div>
          </article>

          <article id="reminders" className="flex flex-col gap-5 rounded-3xl bg-[#0B0F1A] p-8 text-[#F4F2EE]">
            <h3 className="font-display text-2xl font-semibold">Reminders that bring them back</h3>
            <div className="mt-auto flex flex-col gap-2">
              <div className="max-w-[92%] self-start rounded-[16px_16px_16px_4px] bg-[#1F2A44] px-3.5 py-3 text-[13px] leading-snug text-[#E3E7F0]">
                Hi Abena, your GR 1234-24 insurance expires on <strong>9 Dec</strong>. Let Pitstop renew it for you — no queues.
              </div>
              <div className="self-start rounded-full bg-[#C6F432] px-3.5 py-2 text-xs font-semibold text-[#0B0F1A]">Renew with my garage</div>
              <div className="self-end rounded-[16px_16px_4px_16px] bg-[#D4430F] px-3.5 py-2.5 text-[13px]">Yes please, renew it</div>
            </div>
          </article>

          <article className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl font-semibold">Insurance &amp; DVLA, handled</h3>
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

          <article className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl font-semibold">A mechanic app they enjoy</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Big buttons, timers, photo findings — and it works offline in the bay.</p>
            <div className="mt-auto flex items-center gap-3.5 rounded-2xl bg-[#0B0F1A] px-4 py-3.5 text-[#F4F2EE]">
              <Flame className="size-7 text-[#FF7A3D]" />
              <div><div className="text-[15px] font-semibold">5-day streak</div><div className="text-xs text-[#9AA3BC]">Clean Sheet badge unlocked</div></div>
            </div>
          </article>

          <article className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-8">
            <h3 className="font-display text-2xl font-semibold">Parts that reorder themselves</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Low on filters? FixAm drafts the order with your vendor and tracks delivery.</p>
            <div className="mt-auto flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3.5">
              <div><div className="text-sm font-semibold">24 × Oil filter (Toyota)</div><div className="mt-0.5 text-xs text-muted-foreground">Accra Auto Supplies</div></div>
              <span className="whitespace-nowrap rounded-full bg-[#E3F9F7] px-2.5 py-1 text-xs font-semibold text-[#0B6B66]">Arrives 2 pm</span>
            </div>
          </article>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 md:px-8">
        <div className="mx-auto max-w-[640px] text-center">
          <div className={eyebrow}>How it works</div>
          <h2 className={h2}>From gate to payment in three steps.</h2>
        </div>
        <div className="relative mt-16 grid gap-10 md:grid-cols-3">
          <div aria-hidden className="absolute left-[16%] right-[16%] top-[27px] hidden h-0.5 bg-[repeating-linear-gradient(90deg,#E2DACE_0_8px,transparent_8px_16px)] md:block" />
          {[
            { n: "1", t: "Book or drive in", d: "Online booking or walk-in. The front desk checks the car in under two minutes, photos included." },
            { n: "2", t: "Approve, fix, track", d: "The driver approves the estimate on WhatsApp and watches progress live while the team works." },
            { n: "3", t: "Pay and come back", d: "MoMo payment, instant receipt — then FixAm reminds them before the next service is due." },
          ].map((s, i) => (
            <div key={s.n} className="relative flex flex-col items-center gap-3.5 text-center">
              <span
                className={
                  i === 2
                    ? "flex size-14 items-center justify-center rounded-full bg-[#D4430F] font-display text-xl font-bold text-white shadow-[0_10px_24px_-8px_rgba(212,67,15,0.6)]"
                    : "flex size-14 items-center justify-center rounded-full border border-border bg-card font-display text-xl font-bold text-[#D4430F] shadow-2"
                }
              >
                {s.n}
              </span>
              <h3 className="mt-1.5 text-lg font-semibold">{s.t}</h3>
              <p className="max-w-[300px] text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="px-6 pb-24 md:px-8">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[32px] bg-[#0B0F1A] px-6 py-20 text-center text-[#F4F2EE] md:py-[88px]">
          <PhotoImg photo={photos.accraCity} fill sizes="1200px" className="opacity-40" />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.75),rgba(11,15,26,0.9))]" />
          <div aria-hidden className="absolute -bottom-[260px] left-1/2 h-[520px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.35)_0%,rgba(255,90,31,0)_100%)]" />
          <h2 className="relative font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] md:text-6xl">Ready to FixAm your garage?</h2>
          <p className="relative mx-auto mt-[18px] max-w-[520px] text-lg text-[#AEB5C8]">
            Start free for 14 days. We&apos;ll help you import your customers and parts.
          </p>
          <div className="relative mt-[34px] flex flex-wrap justify-center gap-3">
            <Link href="/onboarding" className={ctaPrimary}>Start free trial</Link>
            <Link href="/garages" className={ctaGlass}>Browse garages</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
