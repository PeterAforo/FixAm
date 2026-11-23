"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Bell,
  Car,
  ChevronDown,
  ClipboardList,
  Gauge,
  Inbox,
  LogOut,
  Package,
  Scale,
  CalendarClock,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { signOut } from "@/lib/accounts/actions"
import type { Workspace } from "@/lib/accounts/workspaces"
import { LogoMark } from "@/components/marketing/logo"
import { ThemeToggle } from "@/components/brand/theme-toggle"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  inbox: Inbox,
  settings: Settings,
  car: Car,
  shield: ShieldCheck,
  package: Package,
  bag: ShoppingBag,
  scale: Scale,
  calendarClock: CalendarClock,
  wallet: Wallet,
  store: Store,
  chart: BarChart3,
  list: ClipboardList,
  wrench: Wrench,
  user: UserRound,
  bell: Bell,
}

export type ShellNavItem = { label: string; href: string; icon: keyof typeof ICONS; exact?: boolean; badge?: number }

/**
 * Generic workspace chrome (driver, parts shop, broker): sidebar with the
 * workspace switcher, header with page title + account menu, mobile tab bar.
 */
export function WorkspaceShell({
  workspaces,
  currentKey,
  nav,
  user,
  cta,
  children,
}: {
  workspaces: Workspace[]
  currentKey: string
  nav: ShellNavItem[]
  user: { name: string; detail: string }
  cta?: { label: string; href: string }
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (item: ShellNavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
  const active = [...nav].sort((a, b) => b.href.length - a.href.length).find(isActive)
  const current = workspaces.find((w) => w.key === currentKey)
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")

  async function doSignOut() {
    await signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-4 pb-3 pt-4">
          <Link href={current?.href ?? "/account"} className="flex items-center gap-2.5 px-1">
            <LogoMark className="size-7 rounded-[9px]" />
            <span className="font-display text-[19px] font-bold tracking-[-0.02em]">FixAm</span>
          </Link>
          <WorkspaceSwitcher workspaces={workspaces} currentKey={currentKey} className="mt-4" />
          {cta && (
            <Link
              href={cta.href}
              className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-primary-hover"
            >
              {cta.label}
            </Link>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main navigation">
          <ul className="mt-1 space-y-0.5">
            {nav.map((item) => {
              const Icon = ICONS[item.icon] ?? Gauge
              const on = active?.href === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                      on ? "bg-surface-muted font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("size-[18px] shrink-0", on ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground">{item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-8">
          <div className="min-w-0 flex-1">
            <div className="md:hidden">
              <WorkspaceSwitcher workspaces={workspaces} currentKey={currentKey} className="max-w-[260px]" />
            </div>
            <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm md:flex">
              <span className="truncate text-muted-foreground">{current?.name ?? "FixAm"}</span>
              <span className="text-border-strong" aria-hidden>/</span>
              <span className="truncate font-semibold text-foreground">{active?.label ?? "Overview"}</span>
            </nav>
          </div>
          <ThemeToggle />
          <div className="relative">
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-muted"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(140deg,#FF7A3D,#D4430F)] text-xs font-semibold text-white">
                {initials || "?"}
              </span>
              <span className="hidden max-w-32 truncate text-sm font-medium md:inline">{user.name}</span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
            </button>
            {menuOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-20px_rgba(22,19,15,0.35)]">
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.detail}</p>
                  </div>
                  <ul className="p-1.5">
                    <li>
                      <Link href="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted" onClick={() => setMenuOpen(false)}>
                        <UserRound className="size-4" /> Account &amp; workspaces
                      </Link>
                    </li>
                    <li>
                      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted" onClick={doSignOut}>
                        <LogOut className="size-4" /> Sign out
                      </button>
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 pb-24 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        {nav.slice(0, 5).map((item) => {
          const Icon = ICONS[item.icon] ?? Gauge
          const on = active?.href === item.href
          return (
            <Link key={item.href} href={item.href} className={cn("flex min-h-16 flex-1 flex-col items-center justify-center gap-1", on ? "text-primary" : "text-muted-foreground")}>
              <Icon className="size-5" strokeWidth={1.75} />
              <span className="max-w-16 truncate text-[11px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
