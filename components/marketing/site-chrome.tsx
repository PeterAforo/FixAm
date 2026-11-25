import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "./logo"
import { MobileMenu } from "./mobile-menu"

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/garages", label: "Find a garage" },
  { href: "/parts", label: "Find parts" },
  { href: "/brokers", label: "Insurance & DVLA" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
  { href: "/about", label: "About" },
]

/** Marketing header. `tone="dark"` sits on a carbon hero; `light` is a sticky glass bar. */
export function SiteHeader({ tone = "light", active }: { tone?: "light" | "dark"; active?: string }) {
  const dark = tone === "dark"
  return (
    <header
      className={cn(
        "relative z-20",
        dark ? "text-[#F4F2EE]" : "sticky top-0 border-b border-border bg-background/80 backdrop-blur-xl"
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3.5 sm:px-6 md:px-8 md:py-4">
        <Logo />
        <nav className={cn("hidden items-center gap-6 text-sm lg:flex", dark ? "text-[#B9BFD0]" : "text-muted-foreground")}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.label ? "page" : undefined}
              className={cn(
                "transition-colors",
                dark ? "hover:text-white" : "hover:text-foreground",
                active === n.label && (dark ? "text-white" : "font-semibold text-foreground")
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className="hidden rounded-full px-3.5 py-2.5 text-sm font-medium hover:opacity-80 sm:inline-flex">
            Sign in
          </Link>
          <Link
            href="/signup/garage"
            className={cn(
              "rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90",
              dark ? "bg-[#F4F2EE] text-[#0B0F1A]" : "bg-foreground text-background"
            )}
          >
            Start free trial
          </Link>
          <MobileMenu nav={NAV} active={active} dark={dark} />
        </div>
      </div>
    </header>
  )
}

const FOOTER_COLS = [
  { title: "Product", links: [["/#product", "Workshop"], ["/#payments", "Payments"], ["/#reminders", "Reminders"], ["/pricing", "Pricing"]] },
  { title: "Drivers", links: [["/garages", "Find a garage"], ["/parts", "Find parts near you"], ["/brokers", "Insurance & DVLA brokers"], ["/portal", "My cars"], ["/support#drivers", "Driver help"]] },
  { title: "Partners", links: [["/signup/parts-seller", "Sell parts on FixAm"], ["/signup/insurance-broker", "For insurance brokers"], ["/signup/dvla-agent", "For DVLA agents"], ["/signup/tow-operator", "For tow operators"]] },
  { title: "Company", links: [["/about", "About us"], ["/contact", "Contact"], ["/support", "Help centre"]] },
  { title: "Legal", links: [["/privacy", "Privacy policy"], ["/terms", "Terms of service"]] },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 pb-6 pt-8 sm:gap-10 sm:px-6 sm:pb-8 sm:pt-12 md:px-8 lg:flex-row lg:gap-12 lg:pt-14">
        <div className="flex items-center justify-between gap-4 lg:block lg:w-[260px] lg:shrink-0">
          <div>
            <Logo />
            <p className="mt-3.5 hidden max-w-[260px] text-sm leading-relaxed text-muted-foreground sm:block">
              The garage operating system for Ghana.
            </p>
          </div>
          <Link
            href="/signup/garage"
            className="inline-flex h-10 shrink-0 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 lg:mt-5"
          >
            Start free trial
          </Link>
        </div>
        {/* Phones: each group folds so the footer stays one screen tall. */}
        <div className="divide-y divide-border-subtle border-y border-border-subtle text-sm sm:hidden">
          {FOOTER_COLS.map((c) => (
            <details key={c.title} className="group">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
                {c.title}
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-1 pb-3">
                {c.links.map(([href, label]) => (
                  <Link key={label} href={href} className="py-1.5 text-muted-foreground hover:text-foreground">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </div>
        <div className="hidden flex-1 grid-cols-3 gap-x-6 gap-y-8 text-sm sm:grid lg:grid-cols-5">
          {FOOTER_COLS.map((c) => (
            <div key={c.title} className="flex flex-col gap-2.5">
              <span className="font-semibold">{c.title}</span>
              {c.links.map(([href, label]) => (
                <Link key={label} href={href} className="text-muted-foreground hover:text-foreground">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border-subtle px-5 py-4 text-[13px] sm:px-6 sm:py-6 text-muted-foreground md:px-8">
        <span>© 2026 FixAm. Made in Accra.</span>
        <span>Prices in Ghana cedis (GH₵)</span>
      </div>
    </footer>
  )
}
