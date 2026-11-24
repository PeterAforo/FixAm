import Link from "next/link"
import { Clock, LifeBuoy, Mail, MapPin, MessageCircle, Phone } from "lucide-react"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { PageHero } from "@/components/marketing/page-hero"
import { site, whatsappLink } from "@/lib/site"
import { ContactForm } from "./contact-form"
import { photos } from "@/lib/images"

export const metadata = {
  title: "Contact us",
  description: "Talk to the FixAm team about setting up your garage, pricing, partnerships or support.",
}

export default function ContactPage() {
  const wa = whatsappLink("Hi FixAm, I'd like to talk about my garage.")
  const channels = [
    wa && { icon: MessageCircle, title: "WhatsApp", text: "Fastest way to reach us", value: "Chat with us", href: wa, external: true },
    { icon: Mail, title: "Email", text: "We reply within one working day", value: site.supportEmail, href: `mailto:${site.supportEmail}` },
    site.phone && { icon: Phone, title: "Phone", text: site.supportHours, value: site.phone, href: `tel:${site.phone.replace(/\s/g, "")}` },
  ].filter(Boolean) as { icon: typeof Mail; title: string; text: string; value: string; href: string; external?: boolean }[]

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PageHero
        image={photos.suvGarage}
        eyebrow="Contact"
        title="Let's talk about your garage"
        subtitle="Questions about setup, pricing, partnerships or moving your customers across? Send us a message — a real person in Accra will get back to you."
        className="pb-24"
      />

      <div className="mx-auto grid max-w-[1200px] gap-8 px-6 pb-24 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative z-10 -mt-16 rounded-[24px] border border-border bg-card p-6 shadow-[0_30px_60px_-30px_rgba(11,15,26,0.45)] md:p-10">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Send us a message</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tell us a little about you and we&apos;ll get back to you within one working day.</p>
          <ContactForm email={site.salesEmail} />
        </div>

        <aside className="space-y-4 lg:-mt-16">
          {channels.map((c) => (
            <a
              key={c.title}
              href={c.href}
              target={c.external ? "_blank" : undefined}
              rel={c.external ? "noreferrer" : undefined}
              className="relative z-10 flex items-start gap-4 rounded-[20px] border border-border bg-card p-5 transition-colors hover:border-border-strong"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary"><c.icon className="size-5" /></span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{c.title}</span>
                <span className="block text-[13px] text-muted-foreground">{c.text}</span>
                <span className="mt-1.5 block break-all text-sm font-medium text-[#B8390A]">{c.value}</span>
              </span>
            </a>
          ))}

          <div className="rounded-[20px] border border-border bg-card p-5">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{site.city}</span></li>
              <li className="flex items-start gap-3"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{site.supportHours}</span></li>
            </ul>
          </div>

          <Link href="/support" className="flex items-start gap-4 rounded-[20px] bg-[#0B0F1A] p-5 text-[#F4F2EE]">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><LifeBuoy className="size-5" /></span>
            <span>
              <span className="block text-[15px] font-semibold">Already using FixAm?</span>
              <span className="mt-0.5 block text-[13px] text-[#AEB5C8]">Find answers in the help centre — check-ins, payments, reminders and more.</span>
              <span className="mt-2 block text-sm font-semibold text-[#FF8A57]">Visit the help centre →</span>
            </span>
          </Link>
        </aside>
      </div>
      <SiteFooter />
    </main>
  )
}
