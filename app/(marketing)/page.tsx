import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import {
  BadgeCheck,
  CalendarClock,
  Car,
  ClipboardList,
  MapPin,
  MessageSquare,
  Package,
  Search,
  Star,
  Wallet,
} from "lucide-react"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { postLoginDestination } from "@/lib/auth/destination"

async function AuthGate() {
  const userId = await getSessionUserId()
  if (userId) redirect(await postLoginDestination())
  return null
}

const btnPrimary =
  "rounded-full border-2 border-border bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-chunky-sm transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5"
const btnSecondary =
  "rounded-full border-2 border-border bg-secondary px-6 py-3 font-semibold text-secondary-foreground shadow-chunky-sm transition-transform hover:-translate-y-0.5"

const garageFeatures = [
  { icon: ClipboardList, title: "Jobs & estimates", text: "Check-in wizard, kanban board, estimates customers approve by link." },
  { icon: Wallet, title: "Money, handled", text: "Invoices, MoMo & card payments, instalments, credit accounts, cash-up." },
  { icon: Package, title: "Parts & purchasing", text: "Stock, POS, purchase orders and a vendor marketplace with delivery." },
  { icon: CalendarClock, title: "Renewals on autopilot", text: "Oil, insurance and DVLA reminders sent on WhatsApp & SMS." },
  { icon: Car, title: "Every vehicle tracked", text: "Service history, odometer predictions, documents and due dates." },
  { icon: Star, title: "Customers who come back", text: "Portal, bookings, reviews and ratings that fill your diary." },
]

const customerFeatures = [
  { icon: Search, title: "Find a garage near you", text: "Search verified workshops by location, service or the car you drive." },
  { icon: Car, title: "Your cars, one place", text: "Register once — see service history, documents and what's due." },
  { icon: MessageSquare, title: "Never miss a reminder", text: "Oil changes, insurance and roadworthy alerts before they expire." },
  { icon: BadgeCheck, title: "Pay & book in seconds", text: "Pay invoices by MoMo, approve estimates and book from a link." },
]

export default function MarketingHome() {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>

      {/* Nav */}
      <header className="border-b-2 border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display text-xl font-bold">FixAm</span>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/garages" className="hidden text-muted-foreground hover:text-foreground sm:block">Find a garage</Link>
            <Link href="/portal" className="hidden text-muted-foreground hover:text-foreground sm:block">Customer portal</Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 text-center md:pt-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Fix am. Run your garage.</p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-extrabold leading-tight md:text-6xl">
          The garage operating system for Ghana
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Repairs, parts, renewals, bookings and money — one system for workshops,
          and one app for the drivers who trust them.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/onboarding" className={btnPrimary}>Start free trial</Link>
          <Link href="/garages" className={btnSecondary}>
            <MapPin className="mr-1 inline size-4" /> Find a garage near you
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">14-day free trial · No card required · Cancel anytime</p>
      </section>

      {/* Two audiences */}
      <section className="border-y-2 border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-extrabold">For garages</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Run the whole workshop — front desk to finance — without notebooks or guesswork.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {garageFeatures.map((f) => (
                <li key={f.title} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                  <f.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-bold">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/onboarding" className={btnPrimary}>Open your garage</Link>
              <Link href="/pricing" className={btnSecondary}>See pricing</Link>
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl font-extrabold">For drivers</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No app store needed — your phone number is your account. Find trusted
              garages, track your car and never miss a service again.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {customerFeatures.map((f) => (
                <li key={f.title} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                  <f.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-bold">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/garages" className={btnPrimary}>
                <Search className="mr-1 inline size-4" /> Search garages
              </Link>
              <Link href="/portal" className={btnSecondary}>Open my portal</Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center font-display text-2xl font-extrabold">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { n: "1", t: "Book or walk in", d: "Customers book online or arrive — the garage checks them in in under a minute." },
            { n: "2", t: "We run the job", d: "Estimates approved by SMS link, parts ordered, work tracked on a live board." },
            { n: "3", t: "Get reminded forever", d: "Oil, insurance and roadworthy renewals keep both sides ahead of expiry." },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border-2 border-border bg-card p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">{s.n}</span>
              <p className="mt-3 font-bold">{s.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t-2 border-border bg-primary/5">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2 className="font-display text-3xl font-extrabold">Ready to fix am?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Join the workshops and drivers already running on FixAm.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/onboarding" className={btnPrimary}>Start free trial</Link>
            <Link href="/garages" className={btnSecondary}>Browse garages</Link>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span className="font-display font-bold text-foreground">FixAm</span>
          <div className="flex gap-4">
            <Link href="/garages" className="hover:text-foreground">Garages</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/portal" className="hover:text-foreground">Customer portal</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
