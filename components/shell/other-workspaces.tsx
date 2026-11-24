"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { ChevronDown, Plus, Star } from "lucide-react"
import type { Workspace } from "@/lib/accounts/workspaces"
import { switchHref, workspaceMenu, WORKSPACE_KIND } from "@/lib/accounts/workspace-menu"
import { setDefaultWorkspace } from "@/lib/accounts/actions"
import { WORKSPACE_ICON, WORKSPACE_TINT } from "./workspace-switcher"
import { cn } from "@/lib/utils"

/**
 * Sidebar block under the open workspace's own menu: every OTHER workspace the
 * person has, each as a group with its own menu, plus "make this my default".
 * Links go through /switch so the workspace is remembered as last used.
 */
export function OtherWorkspaces({
  workspaces,
  currentKey,
  defaultKey,
}: {
  workspaces: Workspace[]
  currentKey: string
  defaultKey: string | null
}) {
  const others = workspaces.filter((w) => w.key !== currentKey)
  // Few others → open by default; many → collapsed so the sidebar stays short.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(others.map((w) => [w.key, others.length <= 2]))
  )
  const [savedDefault, setSavedDefault] = useState(defaultKey)
  const [pending, start] = useTransition()
  const isDefault = savedDefault === currentKey

  return (
    <div className="border-t border-border px-3 pb-3 pt-3">
      {others.length > 0 && (
        <>
          <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">Your other workspaces</p>
          <ul className="space-y-1">
            {others.map((w) => {
              const Icon = WORKSPACE_ICON[w.type]
              const expanded = open[w.key]
              const menu = workspaceMenu(w)
              return (
                <li key={w.key}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen((o) => ({ ...o, [w.key]: !o[w.key] }))}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-muted"
                  >
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", WORKSPACE_TINT[w.type])}>
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{w.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {w.type === "garage" && w.role ? `Garage · ${w.role.replace(/_/g, " ")}` : WORKSPACE_KIND[w.type]}{savedDefault === w.key ? " · default" : ""}
                      </span>
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                  </button>
                  {expanded && (
                    <ul className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-border pl-3">
                      {menu.map((m) => (
                        <li key={m.href}>
                          <a
                            href={switchHref(w, m.href)}
                            className="flex h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                          >
                            {m.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className={cn("flex items-center gap-1", others.length > 0 && "mt-2")}>
        {workspaces.length > 1 &&
          (isDefault ? (
            <span className="flex h-8 flex-1 items-center gap-1.5 px-2.5 text-xs text-muted-foreground">
              <Star className="size-3.5 fill-current text-warning" /> Opens when you sign in
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setDefaultWorkspace(currentKey)
                  if (res.ok) setSavedDefault(currentKey)
                })
              }
              className="flex h-8 flex-1 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
            >
              <Star className="size-3.5" /> Open this one when I sign in
            </button>
          ))}
        <Link
          href="/account"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          title="Add a workspace"
        >
          <Plus className="size-3.5" /> Add
        </Link>
      </div>
    </div>
  )
}
