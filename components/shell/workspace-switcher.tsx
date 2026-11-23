"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Car, Check, ChevronsUpDown, Loader2, Plus, ShieldCheck, Store, Wrench, type LucideIcon } from "lucide-react"
import { switchWorkspace } from "@/lib/accounts/actions"
import type { Workspace, WorkspaceType } from "@/lib/accounts/workspaces"
import { cn } from "@/lib/utils"

export const WORKSPACE_ICON: Record<WorkspaceType, LucideIcon> = {
  driver: Car,
  garage: Wrench,
  vendor: Store,
  broker: ShieldCheck,
}

export const WORKSPACE_TINT: Record<WorkspaceType, string> = {
  driver: "bg-[#E6F4FF] text-[#0B5CAD] dark:bg-[#0B5CAD]/20 dark:text-[#8CC4FF]",
  garage: "bg-[#FFEDE4] text-[#B8390A] dark:bg-[#D4430F]/20 dark:text-[#FF8A57]",
  vendor: "bg-[#EEF8D6] text-[#4E6B07] dark:bg-[#C6F432]/15 dark:text-[#C6F432]",
  broker: "bg-[#EFE9FF] text-[#5B3CC4] dark:bg-[#5B3CC4]/25 dark:text-[#B9A5FF]",
}

/**
 * Slack-style workspace switcher. Shows the current workspace and lets the
 * person jump to any other role they hold — or add a new one.
 */
export function WorkspaceSwitcher({
  workspaces,
  currentKey,
  tone = "light",
  className,
}: {
  workspaces: Workspace[]
  currentKey: string
  tone?: "light" | "dark"
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const current = workspaces.find((w) => w.key === currentKey) ?? workspaces[0]
  const CurrentIcon = current ? WORKSPACE_ICON[current.type] : Wrench

  function pick(w: Workspace) {
    if (w.key === currentKey) return setOpen(false)
    setPendingKey(w.key)
    startTransition(async () => {
      const res = await switchWorkspace(w.key)
      router.push(res.ok ? res.data.href : w.href)
      router.refresh()
      setOpen(false)
      setPendingKey(null)
    })
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
          tone === "dark"
            ? "border-white/10 bg-white/5 hover:bg-white/10"
            : "border-border bg-background hover:border-border-strong"
        )}
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", current ? WORKSPACE_TINT[current.type] : "")}>
          <CurrentIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current?.name ?? "FixAm"}</span>
          <span className={cn("block truncate text-xs capitalize", tone === "dark" ? "text-white/60" : "text-muted-foreground")}>
            {current?.subtitle ?? ""}
          </span>
        </span>
        <ChevronsUpDown className={cn("size-4 shrink-0", tone === "dark" ? "text-white/50" : "text-muted-foreground")} />
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute left-0 right-0 z-50 mt-2 min-w-[260px] overflow-hidden rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_24px_60px_-20px_rgba(22,19,15,0.35)]"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Switch workspace</p>
            {workspaces.map((w) => {
              const Icon = WORKSPACE_ICON[w.type]
              const active = w.key === currentKey
              return (
                <button
                  key={w.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(w)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                    active ? "bg-surface-muted" : "hover:bg-surface-muted/70"
                  )}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", WORKSPACE_TINT[w.type])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{w.name}</span>
                    <span className="block truncate text-xs capitalize text-muted-foreground">{w.subtitle}</span>
                  </span>
                  {pendingKey === w.key ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : active ? (
                    <Check className="size-4 text-primary" />
                  ) : null}
                </button>
              )
            })}
            <div className="my-1.5 border-t border-border" />
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium hover:bg-surface-muted"
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-dashed border-border-strong">
                <Plus className="size-4" />
              </span>
              Add a workspace
            </Link>
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-2.5 py-2 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              Account &amp; all workspaces
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
