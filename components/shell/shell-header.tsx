"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/auth/supabase/client"
import { Button } from "@/components/brand/button"
import { ThemeToggle } from "@/components/brand/theme-toggle"
import { Card } from "@/components/brand/card"
import { NotificationsBell, type ShellNotification } from "./notifications-bell"
import { ChevronDown, LogOut, Search } from "lucide-react"

export function ShellHeader({
  garageName,
  userName,
  userEmail,
  role,
  garageId,
  userId,
  notifications,
  onOpenPalette,
}: {
  garageName: string
  userName: string
  userEmail: string
  role: string
  garageId: string
  userId: string
  notifications: ShellNotification[]
  onOpenPalette: () => void
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b-2 border-border bg-background/90 px-4 backdrop-blur md:gap-3 md:px-8">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-bold leading-tight">{garageName}</p>
        <p className="text-xs capitalize text-muted-foreground">{role.replace("_", " ")}</p>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="min-h-11 min-w-11 px-3"
        onClick={onOpenPalette}
        aria-label="Search (Ctrl+K)"
      >
        <Search className="size-5" />
      </Button>
      <NotificationsBell garageId={garageId} userId={userId} initial={notifications} />
      <ThemeToggle />

      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-2 px-3"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="User menu"
        >
          <span className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-accent text-xs font-bold text-accent-foreground">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-28 truncate text-sm font-bold md:inline">
            {userName}
          </span>
          <ChevronDown className="hidden size-4 md:block" />
        </Button>
        {menuOpen && (
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <Card className="absolute right-0 z-50 mt-2 w-56">
              <div className="border-b-2 border-border px-4 py-3">
                <p className="truncate text-sm font-bold">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <ul className="p-2">
                <li>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-surface-muted"
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
