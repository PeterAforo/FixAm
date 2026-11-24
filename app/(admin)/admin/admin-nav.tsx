"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgeCheck,
  Bot,
  Building2,
  Layers,
  LayoutGrid,
  Lock,
  Package,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { LogoMark } from "@/components/marketing/logo"
import { ThemeToggle } from "@/components/brand/theme-toggle"
import { cn } from "@/lib/utils"
import type { Workspace } from "@/lib/accounts/workspaces"
import { OtherWorkspaces } from "@/components/shell/other-workspaces"

type Item = { label: string; href: string; icon: LucideIcon; badge?: number; exact?: boolean }

export function AdminNav({
  badges,
  workspaces = [],
  defaultKey = null,
}: {
  badges: { approvals: number; payments: number; privacy: number }
  workspaces?: Workspace[]
  defaultKey?: string | null
}) {
  const pathname = usePathname()
  const items: Item[] = [
    { label: "Overview", href: "/admin", icon: LayoutGrid, exact: true },
    { label: "Garages", href: "/admin/garages", icon: Building2 },
    { label: "Plans & pricing", href: "/admin/plans", icon: Layers },
    { label: "Approvals", href: "/admin/approvals", icon: BadgeCheck, badge: badges.approvals },
    { label: "Payments & payouts", href: "/admin/payments", icon: Wallet, badge: badges.payments },
    { label: "Insurance partners", href: "/admin/partners", icon: ShieldCheck },
    { label: "Parts & DVLA fees", href: "/admin/catalogue", icon: Package },
    { label: "AI usage", href: "/admin/ai", icon: Bot },
    { label: "Privacy requests", href: "/admin/privacy", icon: Lock, badge: badges.privacy },
  ]
  const isOn = (i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`))

  return (
    <aside className="border-b border-border bg-card md:sticky md:top-0 md:flex md:h-screen md:w-[256px] md:shrink-0 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
        <LogoMark className="size-7 rounded-[9px]" />
        <span className="font-display text-[19px] font-bold tracking-[-0.02em]">FixAm</span>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">Admin</span>
      </div>
      <nav aria-label="Admin" className="overflow-x-auto px-3 pb-3 md:flex-1 md:overflow-y-auto">
        <ul className="flex gap-1 md:mt-1 md:flex-col md:gap-0.5">
          {items.map((i) => {
            const on = isOn(i)
            return (
              <li key={i.href} className="shrink-0">
                <Link
                  href={i.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm transition-colors",
                    on ? "bg-primary/10 font-semibold text-primary" : "font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  )}
                >
                  <i.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="flex-1">{i.label}</span>
                  {i.badge ? (
                    <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground">{i.badge}</span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
        {workspaces.length > 0 && (
          <div className="-mx-3 mt-4 hidden md:block">
            <OtherWorkspaces workspaces={workspaces} currentKey="platform" defaultKey={defaultKey} />
          </div>
        )}
      </nav>
      <div className="hidden items-center justify-end gap-2 border-t border-border px-3 py-3 md:flex">
        <ThemeToggle />
      </div>
    </aside>
  )
}
