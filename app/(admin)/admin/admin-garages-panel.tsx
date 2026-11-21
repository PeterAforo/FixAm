"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { adminSetGarageStatus, startImpersonation } from "@/lib/admin/actions"

type GarageRow = {
  id: string
  name: string
  slug: string
  status: string
  createdAt: Date | string
  planCode: string | null
  planName: string | null
  subStatus: string | null
  isComplimentary: boolean | null
  staffCount: number
  branchCount: number
}

export function AdminGaragesPanel({ garages }: { garages: GarageRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const act = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setMsg(res.error?.message ?? "Action failed")
      else router.refresh()
    })
  }

  const impersonate = (garageId: string) => {
    startTransition(async () => {
      const res = await startImpersonation({ garageId })
      if (res.ok) {
        router.push(`/g/${res.data.garageSlug}`)
        router.refresh()
      } else {
        setMsg(res.error?.message ?? "Could not impersonate")
      }
    })
  }

  return (
    <div className="mt-4">
      {msg && <p className="mb-3 rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{msg}</p>}
      {garages.length === 0 && <p className="text-sm text-muted-foreground">No garages yet.</p>}
      <div className="space-y-3">
        {garages.map((g) => (
          <Card key={g.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{g.name} <span className="text-muted-foreground">/{g.slug}</span></p>
                <p className="text-sm text-muted-foreground">
                  {g.planName ?? "No plan"}{g.subStatus ? ` · ${g.subStatus}` : ""}{g.isComplimentary ? " · complimentary" : ""}
                  {" · "}{g.staffCount} staff · {g.branchCount} branches · {new Date(g.createdAt).toLocaleDateString()}
                </p>
              </div>
              {g.status === "suspended" ? (
                <span className="rounded-lg border-2 border-danger/40 bg-danger/10 px-2 py-1 text-xs font-bold text-danger">Suspended</span>
              ) : (
                <span className="rounded-lg border-2 border-border bg-muted px-2 py-1 text-xs font-bold">Active</span>
              )}
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => impersonate(g.id)}>Impersonate</Button>
              {g.status === "suspended" ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => adminSetGarageStatus({ garageId: g.id, status: "active" }))}>Reactivate</Button>
              ) : (
                <Button size="sm" variant="danger" disabled={pending} onClick={() => act(() => adminSetGarageStatus({ garageId: g.id, status: "suspended" }))}>Suspend</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
