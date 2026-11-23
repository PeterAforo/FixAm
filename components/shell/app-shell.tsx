"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { stopImpersonation } from "@/lib/admin/actions"
import { navForRole, bottomBarForRole, navLabelKey, type NavItem } from "@/lib/nav"
import type { StaffRole } from "@/lib/auth/permissions"
import { cn } from "@/lib/utils"
import { CommandPalette } from "./command-palette"
import { OfflineBanner } from "@/components/brand/offline-banner"
import { LogoMark } from "@/components/marketing/logo"
import { type ShellNotification } from "./notifications-bell"
import { BranchSwitcher, type ShellBranch } from "./branch-switcher"
import { ShellHeader } from "./shell-header"
import { WorkspaceSwitcher } from "./workspace-switcher"
import type { Workspace } from "@/lib/accounts/workspaces"
import {
  BarChart3,
  BellRing,
  Calendar,
  Car,
  Gauge,
  Inbox,
  MessageCircle,
  Truck,
  KanbanSquare,
  Package,
  Plus,
  ScanBarcode,
  Settings,
  ShieldCheck,
  Store,
  Trophy,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  "kanban-square": KanbanSquare,
  inbox: Inbox,
  "message-circle": MessageCircle,
  truck: Truck,
  wrench: Wrench,
  calendar: Calendar,
  car: Car,
  users: Users,
  package: Package,
  "scan-barcode": ScanBarcode,
  store: Store,
  "bell-ring": BellRing,
  "shield-check": ShieldCheck,
  wallet: Wallet,
  "bar-chart-3": BarChart3,
  trophy: Trophy,
  settings: Settings,
}

/** Sidebar grouping (by spec nav label). Anything not listed falls into the first group. */
const GROUPS: { title: string | null; labels: string[] }[] = [
  { title: null, labels: ["Dashboard", "Job board", "My jobs", "Bookings", "Leads", "Claims", "Inbox"] },
  { title: "Customers", labels: ["Vehicles", "Customers", "Reminders", "Renewals"] },
  { title: "Inventory", labels: ["Parts & stock", "POS", "Marketplace"] },
  { title: "Business", labels: ["Money", "Reports", "My stats"] },
]

/** Sub-pages per section, relative to /g/[slug]. The parent links to its first child. */
const SUBNAV: Record<string, { label: string; path: string; exact?: boolean }[]> = {
  "Parts & stock": [
    { label: "Stock", path: "/parts" },
    { label: "Purchase orders", path: "/purchase-orders" },
  ],
  Money: [
    { label: "Invoices", path: "/invoices" },
    { label: "Credit accounts", path: "/credit" },
    { label: "Expenses", path: "/expenses" },
  ],
  Settings: [
    { label: "General", path: "/settings", exact: true },
    { label: "Staff", path: "/settings/staff" },
    { label: "Message templates", path: "/settings/templates" },
  ],
}

/** Sections whose pages live outside their own route segment. */
const EXTRA_PATHS: Record<string, string[]> = {
  "Job board": ["/jobs", "/check-in"],
  "Parts & stock": ["/parts", "/purchase-orders"],
  Money: ["/invoices", "/credit", "/expenses", "/money"],
}

const sectionPath = (route: string) => route.replace("/g/[garageSlug]", "")

export function AppShell({
  garageId,
  garageSlug,
  garageName,
  role,
  userId,
  userName,
  userEmail,
  branches,
  activeBranchId,
  notifications,
  impersonating = false,
  workspaces = [],
  children,
}: {
  garageId: string
  garageSlug: string
  garageName: string
  role: StaffRole
  userId: string
  userName: string
  userEmail: string
  branches: ShellBranch[]
  activeBranchId: string | null
  notifications: ShellNotification[]
  impersonating?: boolean
  workspaces?: Workspace[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const tNav = useTranslations("nav")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const labelFor = (label: string) => {
    const key = navLabelKey(label)
    return key ? tNav(key) : label
  }

  const nav = navForRole(role)
  const bottom = bottomBarForRole(role)
  const base = `/g/${garageSlug}`
  const canCheckIn = bottom.includes("+ Check in")

  const matches = (path: string, exact = false) =>
    exact
      ? pathname === `${base}${path}`
      : pathname === `${base}${path}` || pathname.startsWith(`${base}${path}/`)

  const isActive = (item: NavItem) => {
    const own = sectionPath(item.route)
    if (own === "") return pathname === base
    const paths = EXTRA_PATHS[item.label] ?? [own]
    return paths.some((p) => matches(p))
  }

  const hrefFor = (item: NavItem) => {
    const sub = SUBNAV[item.label]
    return `${base}${sub ? sub[0]!.path : sectionPath(item.route)}`
  }

  const activeItem = nav.find(isActive)
  const activeSub = activeItem
    ? SUBNAV[activeItem.label]?.slice().reverse().find((s) => matches(s.path, s.exact))
    : undefined
  const pageTitle =
    activeSub && activeItem?.label !== "Settings"
      ? activeSub.label
      : activeItem
        ? labelFor(activeItem.label)
        : "Dashboard"

  const settingsItem = nav.find((i) => i.label === "Settings")
  const grouped = GROUPS.map((g) => ({
    title: g.title,
    items: nav.filter((i) => g.labels.includes(i.label)),
  }))
  const leftovers = nav.filter(
    (i) => i.label !== "Settings" && !GROUPS.some((g) => g.labels.includes(i.label))
  )
  if (leftovers.length) grouped[0]!.items.push(...leftovers)

  // Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const renderItem = (item: NavItem) => {
    const Icon = ICONS[item.icon] ?? Wrench
    const active = isActive(item)
    const sub = SUBNAV[item.label]
    return (
      <li key={item.route}>
        <Link
          href={hrefFor(item)}
          aria-current={active && !sub ? "page" : undefined}
          className={cn(
            "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
            active
              ? "bg-surface-muted font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground"
          )}
        >
          <Icon
            className={cn(
              "size-[18px] shrink-0",
              active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}
            strokeWidth={1.75}
          />
          {labelFor(item.label)}
        </Link>
        {sub && active && (
          <ul className="mb-1 ml-[19px] mt-0.5 space-y-0.5 border-l border-border pl-3">
            {sub.map((s) => {
              const subActive = matches(s.path, s.exact)
              return (
                <li key={s.path}>
                  <Link
                    href={`${base}${s.path}`}
                    aria-current={subActive ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors",
                      subActive
                        ? "bg-card font-semibold text-foreground shadow-1"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-4 pb-3 pt-4">
          <Link href={base} className="flex items-center gap-2.5 px-1">
            <LogoMark className="size-7 rounded-[9px]" />
            <span className="font-display text-[19px] font-bold tracking-[-0.02em]">FixAm</span>
          </Link>
          {workspaces.length > 1 ? (
            <div className="mt-4 space-y-1.5">
              <WorkspaceSwitcher workspaces={workspaces} currentKey={`garage:${garageSlug}`} />
              <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                <span>Branch</span>
                <BranchSwitcher branches={branches} activeBranchId={activeBranchId} garageSlug={garageSlug} />
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{garageName}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{role.replace(/_/g, " ")}</span>
                <BranchSwitcher branches={branches} activeBranchId={activeBranchId} garageSlug={garageSlug} />
              </div>
            </div>
          )}
          {canCheckIn && (
            <Link
              href={`${base}/check-in`}
              className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-primary-hover"
            >
              <Plus className="size-4" strokeWidth={2.4} /> Check in vehicle
            </Link>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main navigation">
          {grouped.map((g, gi) =>
            g.items.length ? (
              <div key={gi} className={gi > 0 ? "mt-5" : "mt-1"}>
                {g.title && (
                  <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">{g.title}</p>
                )}
                <ul className="space-y-0.5">{g.items.map(renderItem)}</ul>
              </div>
            ) : null
          )}
        </nav>

        {settingsItem && (
          <div className="border-t border-border px-3 py-3">
            <ul>{renderItem(settingsItem)}</ul>
          </div>
        )}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellHeader
          garageName={garageName}
          pageTitle={pageTitle}
          userName={userName}
          userEmail={userEmail}
          role={role}
          garageId={garageId}
          userId={userId}
          notifications={notifications}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        {impersonating && (
          <div className="flex items-center justify-between gap-3 border-b border-warning/40 bg-warning-subtle px-4 py-2 text-sm">
            <p className="font-semibold text-foreground">Platform admin view — actions are audited</p>
            <ImpersonationExit />
          </div>
        )}
        <OfflineBanner />
        <main className="flex-1 pb-24 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        {bottom.map((label) => {
          const item = nav.find((i) => i.label === label)
          const isFab = label === "+ Check in"
          const href = isFab ? `${base}/check-in` : item ? hrefFor(item) : undefined
          if (!href) return null
          const active = !isFab && item ? isActive(item) : false
          const Icon = item ? (ICONS[item.icon] ?? Wrench) : Plus
          return (
            <Link
              key={label}
              href={href}
              aria-label={isFab ? "Check in vehicle" : undefined}
              className={cn(
                "flex min-h-16 flex-1 items-center justify-center",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isFab ? (
                <span className="flex size-12 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow-primary">
                  <Plus className="size-5" strokeWidth={2.4} />
                </span>
              ) : (
                <span className="flex flex-col items-center gap-1">
                  <Icon className="size-5" strokeWidth={1.75} />
                  <span className="max-w-16 truncate text-[11px] font-medium">{labelFor(label)}</span>
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        role={role}
        garageSlug={garageSlug}
        garageId={garageId}
      />
    </div>
  )
}

function ImpersonationExit() {
  const router = useRouter()
  return (
    <button
      type="button"
      className="rounded-full border border-warning px-3 py-1 text-xs font-semibold hover:bg-warning/10"
      onClick={async () => {
        await stopImpersonation()
        router.push("/admin")
        router.refresh()
      }}
    >
      Exit impersonation
    </button>
  )
}
