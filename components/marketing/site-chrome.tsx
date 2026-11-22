import Link from "next/link"
import { cn } from "@/lib/utils"
import { Logo } from "./logo"

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#drivers", label: "For drivers" },
  { href: "/pricing", label: "Pricing" },
  { href: "/garages", label: "Find a garage" },
]

/** Marketing header. `tone="dark"` sits on the carbon hero; `light` is a sticky glass bar. */
export function SiteHeader({ tone = "light", active }: { tone?: "light" | "dark"; active?: string }) {
  const dark = tone === "dark"
  return (
    <header
      className={cn(
        "relative z-20",
        dark ? "text-[#F4F2EE]" : "sticky top-0 border-b border-border bg-background/80 backdrop-blur-xl"
      )}
    >
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-4 md:px-8">
        <Logo />
        <nav className={cn("hidden items-center gap-7 text-sm md:flex", dark ? "text-[#B9BFD0]" : "text-muted-foreground")}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
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
          <Link href="/login" className="rounded-full px-3.5 py-2.5 text-sm font-medium hover:opacity-80">
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className={cn(
              "rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90",
              dark ? "bg-[#F4F2EE] text-[#0B0F1A]" : "bg-foreground text-background"
            )}
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  )
}

const FOOTER_COLS = [
  { title: "Product", links: [["/#product", "Workshop"], ["/#payments", "Payments"], ["/#reminders", "Reminders"], ["/pricing", "Pricing"]] },
  { title: "Drivers", links: [["/garages", "Find a garage"], ["/portal", "Customer portal"]] },
  { title: "Vendors", links: [["/vendor", "Sell on FixAm"]] },
  { title: "Account", links: [["/login", "Garage sign in"], ["/onboarding", "Start free trial"]] },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-12 px-6 pb-8 pt-14 md:px-8">
        <div className="min-w-[220px] flex-1">
          <Logo />
          <p className="mt-3.5 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
            The garage operating system for Ghana.
          </p>
        </div>
        <div className="grid flex-[2] grid-cols-2 gap-6 text-sm sm:grid-cols-4">
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
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-4 border-t border-border-subtle px-6 py-6 text-[13px] text-muted-foreground md:px-8">
        <span>© 2026 FixAm. Made in Accra.</span>
        <span>Prices in Ghana cedis (GH₵)</span>
      </div>
    </footer>
  )
}
