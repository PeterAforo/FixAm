"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/auth/supabase/client"
import { Button } from "@/components/brand/button"
import { ThemeToggle } from "@/components/brand/theme-toggle"
import { Card } from "@/components/brand/card"
import { NotificationsBell, type ShellNotification } from "./notifications-bell"
import { ChevronDown, LogOut, Search, Users } from "lucide-react"

export function ShellHeader({
  garageName,
  pageTitle,
  userName,
  userEmail,
  role,
  garageId,
  userId,
  notifications,
  onOpenPalette,
  mobileTitle,
}: {
  garageName: string
  pageTitle?: string
  userName: string
  userEmail: string
  role: string
  garageId: string
  userId: string
  notifications: ShellNotification[]
  /** Opens the search palette, optionally with text already typed. */
  onOpenPalette: (query?: string) => void
  /** Replaces the garage name on phones, e.g. a workspace switcher. */
  mobileTitle?: ReactNode
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("")

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:gap-3 md:px-8">
      <div className="min-w-0 flex-1 lg:max-w-[280px] lg:flex-none">
        {/* Mobile: garage name (sidebar is hidden). Desktop: breadcrumb. */}
        {mobileTitle ? (
          <div className="md:hidden">{mobileTitle}</div>
        ) : (
          <p className="truncate text-[15px] font-semibold md:hidden">{garageName}</p>
        )}
        <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm md:flex">
          <span className="truncate text-muted-foreground">{garageName}</span>
          <span className="text-border-strong" aria-hidden>/</span>
          <span className="truncate font-semibold text-foreground">{pageTitle ?? "Dashboard"}</span>
        </nav>
      </div>

      {/* Desktop: a real search field across the header. Typing opens the
          search panel with the text carried over (plates, customers, pages). */}
      <div className="hidden min-w-0 flex-1 justify-center lg:flex">
        <label className="relative flex h-11 w-full max-w-2xl items-center">
          <span className="sr-only">Search plates, phone numbers, customers and pages</span>
          <Search className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
          <input
            type="search"
            value=""
            placeholder="Search plates, phone numbers, customers, pages…"
            onChange={(e) => onOpenPalette(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpenPalette("")
            }}
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-16 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-border-strong focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
          />
          <kbd className="pointer-events-none absolute right-3 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">Ctrl K</kbd>
        </label>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 min-w-11 px-2.5 lg:hidden"
        onClick={() => onOpenPalette()}
        aria-label="Search (Ctrl+K)"
      >
        <Search className="size-5" />
      </Button>
      <NotificationsBell garageId={garageId} userId={userId} initial={notifications} />
      <ThemeToggle />

      <div className="relative">
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-muted"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="User menu"
          aria-expanded={menuOpen}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(140deg,#FF7A3D,#D4430F)] text-xs font-semibold text-white">
            {initials || "?"}
          </span>
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">{userName}</span>
          <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
        </button>
        {menuOpen && (
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <Card className="absolute right-0 z-50 mt-2 w-60 shadow-3">
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-semibold">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{role.replace(/_/g, " ")}</p>
              </div>
              <ul className="p-1.5">
                <li>
                  <a href="/account" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted">
                    <Users className="size-4" /> Account &amp; workspaces
                  </a>
                </li>
                <li>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted"
                    onClick={signOut}
                  >
                    <LogOut className="size-4" /> Sign out
                  </button>
                </li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </header>
  )
}
