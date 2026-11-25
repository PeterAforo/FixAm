"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Small-screen site menu: a button in the header that opens the site links,
 * Sign in and Start free trial as a panel under the header. Replaces the old
 * sideways-scrolling row of links (cut off, with a visible scrollbar).
 */
export function MobileMenu({
  nav,
  active,
  dark,
}: {
  nav: readonly { href: string; label: string }[]
  active?: string
  dark: boolean
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  // Close when the page changes (state reset during render, not in an effect).
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="site-mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-11 items-center justify-center rounded-full border transition-colors",
          dark ? "border-white/20 hover:bg-white/10" : "border-border hover:bg-surface-muted"
        )}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-[72px] z-30 cursor-default bg-black/40"
          />
          <nav
            id="site-mobile-menu"
            aria-label="Site"
            className="absolute inset-x-3 top-[72px] z-40 max-h-[calc(100dvh-88px)] overflow-y-auto rounded-[22px] border border-border bg-card p-3 text-foreground shadow-[0_24px_60px_-20px_rgba(11,15,26,0.5)]"
          >
            <ul className="flex flex-col">
              {nav.map((n) => {
                const on = active === n.label
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={on ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex h-12 items-center rounded-xl px-4 text-[16px] font-medium hover:bg-surface-muted",
                        on && "bg-primary/10 font-semibold text-primary"
                      )}
                    >
                      {n.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-semibold hover:bg-surface-muted"
              >
                Sign in
              </Link>
              <Link
                href="/signup/garage"
                onClick={() => setOpen(false)}
                className="flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Start free trial
              </Link>
            </div>
          </nav>
        </>
      )}
    </div>
  )
}
