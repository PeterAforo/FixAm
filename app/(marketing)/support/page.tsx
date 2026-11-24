import Link from "next/link"
import {
  BellRing,
  Car,
  ClipboardCheck,
  CreditCard,
  Mail,
  MessageCircle,
  Package,
  Rocket,
  Users,
} from "lucide-react"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { PageHero } from "@/components/marketing/page-hero"
import { site, whatsappLink } from "@/lib/site"
import { HelpSearch, type HelpTopic } from "./help-search"
import { photos } from "@/lib/images"

export const metadata = {
  title: "Help centre",
  description: "Answers for garages and drivers using FixAm — check-ins, estimates, MoMo payments, reminders, renewals and your account.",
}

const TOPICS: (HelpTopic & { icon: typeof Rocket })[] = [
  {
    id: "getting-started",
    icon: Rocket,
    title: "Getting started",
    summary: "Set up your garage, branches and team.",
    faqs: [
      { q: "How do I set up my garage on FixAm?", a: "Start a free trial, then follow the onboarding wizard: add your garage details and logo, your branches and bays, invite your staff, set your labour rate and tax settings. Most garages finish in under ten minutes." },
      { q: "How do I invite my staff?", a: "Go to Settings → Staff and invite each person by phone number or email, choosing their role (owner, manager, service advisor, mechanic, storekeeper or accountant) and branch. They get a link by SMS, WhatsApp or email to join." },
      { q: "Can I import my existing customers and parts?", a: "Yes. Parts can be imported from a CSV file on the Parts & stock page. For customers and vehicles, contact us and we'll help you move them across during setup." },
      { q: "Does FixAm work on my phone?", a: "Yes. FixAm works in any modern browser on Android, iPhone, tablet or computer, and can be installed to your home screen. The mechanic screens keep working when the network drops and sync when you're back online." },
    ],
  },
  {
    id: "jobs",
    icon: ClipboardCheck,
    title: "Jobs & estimates",
    summary: "Check-ins, the job board and customer approvals.",
    faqs: [
      { q: "How do I check in a vehicle?", a: "Tap Check in vehicle, find or add the customer and car, record the odometer and fuel level, take walk-around photos, note the complaint, assign a mechanic and capture the customer's signature. A live tracker link is sent to the customer automatically." },
      { q: "How do customers approve an estimate?", a: "Build the estimate on the job, then send it. The customer gets a link by WhatsApp or SMS where they can see your findings and photos and approve or decline each line. You can also approve on their behalf after a phone call — FixAm records who approved and why." },
      { q: "Why can't I move a job to Ready?", a: "A job needs its quality check signed off by an owner or manager before it can be marked Ready. This keeps comebacks down and protects your reputation." },
      { q: "What does the customer see on the tracker?", a: "The current status, an estimated ready time, the photos and notes you mark as visible to the customer, and buttons to call or WhatsApp the garage. Internal notes are never shown." },
    ],
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Payments & money",
    summary: "MoMo, invoices, deposits, instalments and credit.",
    faqs: [
      { q: "Which payment methods are supported?", a: "Mobile Money (MTN, Telecel and AirtelTigo), Visa and Mastercard cards, cash, bank transfer and cheque. Online payments go through Paystack and are confirmed automatically." },
      { q: "How do I send a customer a pay link?", a: "Open the invoice or the job and choose Send pay link. The customer receives a secure link by WhatsApp or SMS and approves the MoMo prompt on their phone. A receipt is sent as soon as the payment clears." },
      { q: "Can customers pay in instalments?", a: "Yes. From an issued invoice, create a payment plan with a down payment, number of instalments and frequency. Each instalment gets automatic reminders and its own pay link." },
      { q: "How do credit accounts work?", a: "Trusted customers and fleets can be given a credit limit and payment terms under Money → Credit accounts. Invoices are charged to the account and a statement is generated every month, with ageing so you can see what's overdue." },
      { q: "Can I edit an invoice after issuing it?", a: "Issued invoices are locked so your records stay trustworthy. To correct one, issue a credit note, or void it if you're the owner and then issue a new invoice." },
    ],
  },
  {
    id: "reminders",
    icon: BellRing,
    title: "Reminders & renewals",
    summary: "Oil, service, insurance and DVLA reminders.",
    faqs: [
      { q: "When are reminders sent?", a: "FixAm checks every hour and sends reminders ahead of each due date — for example 30, 14, 7 and 1 days before insurance or roadworthy expiry, and on the day. No reminders are sent between 9 pm and 7 am." },
      { q: "How does FixAm know when an oil change is due by mileage?", a: "Every odometer reading — at check-in or from the customer — is used to estimate how far the car drives each day. The reminder goes out on the due date or the predicted mileage date, whichever comes first." },
      { q: "Can my garage renew insurance and DVLA documents for customers?", a: "Yes, on plans that include agent renewals. The customer requests a renewal, uploads documents and pays the quote online; you process it and upload the new certificate, and the next reminder is scheduled automatically. Insurance renewals need a licensed partner insurer or broker." },
      { q: "How many messages are included?", a: "Each plan includes a monthly allowance of SMS and WhatsApp messages. Push notifications and email are free. You'll get a warning at 80% and can add message bundles at any time." },
    ],
  },
  {
    id: "parts",
    icon: Package,
    title: "Parts & marketplace",
    summary: "Stock, counter sales and ordering from vendors.",
    faqs: [
      { q: "How is stock updated?", a: "Parts are reserved when an estimate is approved and issued when the job is delivered. Counter sales, purchase orders, transfers and adjustments all record a stock movement, so levels are always accurate." },
      { q: "What is automatic reordering?", a: "When a part drops below its reorder level, FixAm drafts an order with your preferred vendor. You can approve it with one tap, or let it send automatically within a spend limit you set." },
      { q: "How do I sell parts as a vendor?", a: "Vendors sign up from the vendor page, add their catalogue and delivery areas, and are approved by our team before appearing in the marketplace. Payouts go to your MoMo or bank account." },
    ],
  },
  {
    id: "drivers",
    icon: Car,
    title: "For drivers",
    summary: "Your portal, tracker links and reminders.",
    faqs: [
      { q: "Do I need to download an app?", a: "No. You'll receive secure links by WhatsApp or SMS for tracking, approving and paying. You can also sign in to the customer portal at any time with your phone number." },
      { q: "How do I update my car's mileage?", a: "Tap the link in a mileage reminder, reply to the WhatsApp message with your current reading, or update it from your vehicle in the customer portal." },
      { q: "Can I turn reminders off?", a: "Yes. Reply STOP to an SMS, or choose which channels you want in the portal under your settings. Receipts and security codes are still sent." },
      { q: "Who can see my information?", a: "Each garage only sees its own visits with you. FixAm never sells your personal data. Read our privacy policy for the details." },
    ],
  },
  {
    id: "account",
    icon: Users,
    title: "Account & billing",
    summary: "Plans, subscription and security.",
    faqs: [
      { q: "How do I pay for my FixAm subscription?", a: "Monthly by Mobile Money or card from Settings. You can upgrade, downgrade or cancel at any time." },
      { q: "What happens if a payment fails?", a: "You'll get a grace period to update your payment method. After that the workspace becomes read-only — your data is safe, and you can still collect payments on existing invoices — until the subscription is paid." },
      { q: "Can I export my data?", a: "Yes. Reports export to CSV, and you can request a full export of your garage's data at any time by contacting support." },
    ],
  },
]

export default function SupportPage() {
  const wa = whatsappLink("Hi FixAm support, I need help with…")
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PageHero
        image={photos.mechanicEngine}
        active="Support"
        eyebrow="Help centre"
        title="How can we help?"
        subtitle="Answers for garages and drivers — from your first check-in to MoMo payments and DVLA renewals."
        className="pb-24"
      />

      <div className="mx-auto max-w-[1200px] px-6 pb-24 md:px-8">
        <HelpSearch topics={TOPICS.map((t) => ({ id: t.id, title: t.title, summary: t.summary, faqs: t.faqs }))} />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOPICS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="group rounded-[20px] border border-border bg-card p-5 transition-colors hover:border-border-strong">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-subtle text-primary"><t.icon className="size-5" /></span>
              <p className="mt-4 text-[15px] font-semibold">{t.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t.summary}</p>
              <p className="mt-3 text-xs font-medium text-muted-foreground">{t.faqs.length} articles</p>
            </a>
          ))}
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Help topics" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1 text-sm">
              {TOPICS.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-card hover:text-foreground">{t.title}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-12">
            {TOPICS.map((t) => (
              <section key={t.id} id={t.id} className="scroll-mt-24">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-card text-primary shadow-1"><t.icon className="size-[18px]" /></span>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">{t.title}</h2>
                </div>
                <div className="mt-5 overflow-hidden rounded-[20px] border border-border bg-card">
                  {t.faqs.map((f, i) => (
                    <details key={f.q} className={`group ${i > 0 ? "border-t border-border" : ""}`}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                        {f.q}
                        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted-foreground transition-transform group-open:rotate-45">+</span>
                      </summary>
                      <p className="px-6 pb-6 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Still need help */}
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          <div className="rounded-[22px] bg-[#0B0F1A] p-7 text-[#F4F2EE] md:col-span-1">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Still need help?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#AEB5C8]">Our team in Accra answers {site.supportHours.toLowerCase()}.</p>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="flex items-start gap-4 rounded-[22px] border border-border bg-card p-7 transition-colors hover:border-border-strong">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary"><MessageCircle className="size-5" /></span>
              <span>
                <span className="block text-[15px] font-semibold">Chat on WhatsApp</span>
                <span className="mt-1 block text-sm text-muted-foreground">The quickest way to get an answer.</span>
              </span>
            </a>
          )}
          <a href={`mailto:${site.supportEmail}`} className="flex items-start gap-4 rounded-[22px] border border-border bg-card p-7 transition-colors hover:border-border-strong">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary"><Mail className="size-5" /></span>
            <span>
              <span className="block text-[15px] font-semibold">Email support</span>
              <span className="mt-1 block break-all text-sm text-muted-foreground">{site.supportEmail}</span>
            </span>
          </a>
          {!wa && (
            <Link href="/contact" className="flex items-start gap-4 rounded-[22px] border border-border bg-card p-7 transition-colors hover:border-border-strong">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary"><MessageCircle className="size-5" /></span>
              <span>
                <span className="block text-[15px] font-semibold">Contact the team</span>
                <span className="mt-1 block text-sm text-muted-foreground">Send us a message and we&apos;ll reply within a working day.</span>
              </span>
            </Link>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
