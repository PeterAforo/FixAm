"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { stopImpersonation } from "@/lib/admin/actions"
import { navForRole, bottomBarForRole, navItemForPath, navLabelKey } from "@/lib/nav"
import type { StaffRole } from "@/lib/auth/permissions"
import { CommandPalette } from "./command-palette"
import { OfflineBanner } from "@/components/brand/offline-banner"
import { type ShellNotification } from "./notifications-bell"
import { BranchSwitcher, type ShellBranch } from "./branch-switcher"
import { ShellHeader } from "./shell-header"
import {
  BarChart3,
  BellRing,
  Calendar,
  Car,
  Gauge,
  KanbanSquare,
  Package,
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
  const href = (route: string) => `${base}${route.replace("/g/[garageSlug]", "")}`
  const activeItem = navItemForPath(role, pathname, garageSlug)

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

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r-2 border-border bg-card md:flex">
        <Link
          href={base}
          className="flex h-16 items-center gap-2 border-b-2 border-border px-5 font-display text-xl font-bold"
        >
          <Wrench className="size-6 text-primary" />
          FixAm
        </Link>
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {nav.map((item) => {
              const Icon = ICONS[item.icon] ?? Wrench
              const active = activeItem?.route === item.route
              return (
                <li key={item.route}>
                  <Link
                    href={href(item.route)}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-surface-muted"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    {labelFor(item.label)}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t-2 border-border p-3">
          <BranchSwitcher
            branches={branches}
            activeBranchId={activeBranchId}
            garageSlug={garageSlug}
          />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellHeader
          garageName={garageName}
          userName={userName}
          userEmail={userEmail}
          role={role}
          garageId={garageId}
          userId={userId}
          notifications={notifications}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        {impersonating && (
          <div className="flex items-center justify-between gap-3 border-b-2 border-warning bg-warning/10 px-4 py-2 text-sm">
            <p className="font-semibold text-warning">Platform admin view — actions are audited</p>
            <ImpersonationExit />
          </div>
        )}
        <OfflineBanner />
        <main className="flex-1 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t-2 border-border bg-card md:hidden"
        aria-label="Mobile navigation"
      >
        {bottom.map((label) => {
          const item = nav.find((i) => i.label === label)
          const route =
            item?.route ?? (label === "+ Check in" ? "/g/[garageSlug]/check-in" : undefined)
          const isFab = label === "+ Check in"
          if (!route) return null
          const active = activeItem?.route === item?.route
          const inner = isFab ? (
            <span className="flex size-12 -translate-y-4 items-center justify-center rounded-full border-2 border-border bg-accent text-lg font-bold text-accent-foreground shadow-chunky">
              +
            </span>
          ) : (
            (() => {
              const Icon = ICONS[item!.icon] ?? Wrench
              return (
                <span className="flex flex-col items-center gap-0.5">
                  <Icon className="size-5" />
                  <span className="max-w-16 truncate text-[10px] font-bold">
                    {labelFor(label).replace("+ ", "")}
                  </span>
                </span>
              )
            })()
          )
          return (
            <Link
              key={label}
              href={href(route)}
              className={`flex min-h-16 flex-1 items-center justify-center ${
                isFab ? "pt-2" : ""
              } ${active && !isFab ? "text-primary" : "text-muted-foreground"}`}
            >
              {inner}
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
      className="rounded-lg border-2 border-warning px-3 py-1 text-xs font-bold text-warning hover:bg-warning/10"
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
