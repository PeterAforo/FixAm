"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, LogOut, Plus } from "lucide-react"
import { signOut, switchWorkspace } from "@/lib/accounts/actions"
import type { Workspace } from "@/lib/accounts/workspaces"
import { WORKSPACE_ICON, WORKSPACE_TINT } from "@/components/shell/workspace-switcher"
import { cn } from "@/lib/utils"

export function AccountActions() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOut()
          router.push("/")
          router.refresh()
        })
      }
      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-60"
    >
      <LogOut className="size-4" /> Sign out
    </button>
  )
}

export function OpenWorkspaceButton({
  workspace: w,
  label,
  stats = [],
  featured = false,
  lastUsed = false,
}: {
  workspace: Workspace
  label: string
  stats?: { label: string; value: number }[]
  featured?: boolean
  lastUsed?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const Icon = WORKSPACE_ICON[w.type]
  const isEmptyDriver = w.type === "driver" && stats.length > 0 && stats[0]!.value === 0
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await switchWorkspace(w.key)
          router.push(res.ok ? res.data.href : w.href)
        })
      }
      className={cn(
        "group flex h-full w-full flex-col gap-5 rounded-[22px] border-2 p-6 text-left transition-all hover:-translate-y-0.5 disabled:opacity-80",
        featured
          ? "border-secondary bg-secondary text-secondary-foreground shadow-[0_18px_40px_-20px_rgba(11,27,63,0.55)] hover:border-primary"
          : "border-border bg-card hover:border-primary/60 hover:shadow-[0_18px_40px_-24px_rgba(22,19,15,0.35)]"
      )}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3.5">
          <span
            className={cn(
              "flex size-[52px] shrink-0 items-center justify-center rounded-2xl",
              featured ? "bg-white/10 text-[#C6F432]" : WORKSPACE_TINT[w.type]
            )}
          >
            <Icon className="size-6" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className={cn("block text-[13px]", featured ? "text-white/65" : "text-muted-foreground")}>{label}</span>
            <span className="block truncate font-display text-[22px] font-bold leading-tight">{w.name}</span>
          </span>
        </span>
        {lastUsed && (
          <span className="shrink-0 rounded-full bg-[#C6F432] px-2.5 py-1 text-xs font-semibold text-[#0B1B3F]">Last used</span>
        )}
      </span>

      {isEmptyDriver ? (
        <span className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          <Plus className="size-5 shrink-0 text-primary" />
          <span>
            <span className="block font-semibold">Add your first car</span>
            <span className={cn("block", featured ? "text-white/70" : "text-muted-foreground")}>Get oil, insurance and DVLA reminders automatically.</span>
          </span>
        </span>
      ) : stats.length > 0 ? (
        <span className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s) => (
            <span key={s.label} className={cn("rounded-xl p-3", featured ? "bg-white/[0.07]" : "bg-surface-muted/60")}>
              <span className="block text-[22px] font-semibold leading-none tabular-nums">{s.value.toLocaleString()}</span>
              <span className={cn("mt-1.5 block text-xs", featured ? "text-white/65" : "text-muted-foreground")}>{s.label}</span>
            </span>
          ))}
        </span>
      ) : null}

      <span className="mt-auto flex w-full items-center justify-between gap-3 text-sm">
        <span className={cn("truncate capitalize", featured ? "text-white/65" : "text-muted-foreground")}>{w.subtitle}</span>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 font-semibold", featured ? "text-white" : "text-primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <>{featured ? "Continue" : "Open"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}
        </span>
      </span>
    </button>
  )
}
