"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/brand/button"
import { Card } from "@/components/brand/card"
import { MapPin } from "lucide-react"

export type ShellBranch = { id: string; name: string }

const COOKIE = "fixam_branch_id"

/** Branch switcher — writes a cookie and refreshes server components. */
export function BranchSwitcher({
  branches,
  activeBranchId,
}: {
  branches: ShellBranch[]
  activeBranchId: string | null
  garageSlug: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (branches.length <= 1) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
        <MapPin className="size-3.5 shrink-0" />
        {branches[0]?.name ?? "All branches"}
      </span>
    )
  }
  const active = branches.find((b) => b.id === activeBranchId)

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="!min-h-0 gap-1 !px-1.5 py-0.5 text-xs font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <MapPin className="size-4" />
        {active?.name ?? "All branches"}
      </Button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close branch switcher"
            onClick={() => setOpen(false)}
          />
          <Card className="absolute left-0 z-50 mt-2 w-56">
            <ul className="p-2">
              <li>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-muted"
                  onClick={() => {
                    document.cookie = `${COOKIE}=; path=/; max-age=0`
                    setOpen(false)
                    router.refresh()
                  }}
                >
                  All branches
                </button>
              </li>
              {branches.map((b) => (
                <li key={b.id}>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-muted"
                    onClick={() => {
                      document.cookie = `${COOKIE}=${b.id}; path=/`
                      setOpen(false)
                      router.refresh()
                    }}
                  >
                    {b.name}
                    {b.id === activeBranchId && " ✓"}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
