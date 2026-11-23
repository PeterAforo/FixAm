"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, LogOut } from "lucide-react"
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

export function OpenWorkspaceButton({ workspace: w, label }: { workspace: Workspace; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const Icon = WORKSPACE_ICON[w.type]
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
      className="group flex w-full items-center gap-4 rounded-[20px] border border-border bg-card p-4 text-left shadow-[0_1px_2px_rgba(22,19,15,0.04)] transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_18px_40px_-24px_rgba(22,19,15,0.35)]"
    >
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", WORKSPACE_TINT[w.type])}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="block truncate text-[15px] font-semibold">{w.name}</span>
        <span className="block truncate text-[13px] capitalize text-muted-foreground">{w.subtitle}</span>
      </span>
      {pending ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      )}
    </button>
  )
}
