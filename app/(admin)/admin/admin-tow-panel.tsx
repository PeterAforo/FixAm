"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { adminUpdateTowOperator, type AdminTowOperatorView } from "@/lib/towing/actions"

export function AdminTowPanel({ operators }: { operators: AdminTowOperatorView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function update(operatorId: string, status: "pending" | "active" | "suspended") {
    start(async () => {
      const res = await adminUpdateTowOperator({ operatorId, status })
      if (!res.ok) return setMsg(res.error)
      setMsg(null)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-border bg-card">
      {msg && <p className="border-b border-border bg-danger-subtle px-4 py-2 text-sm">{msg}</p>}
      <div className="overflow-x-auto"><table className="table-cards w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-border bg-surface-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">Business</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Jobs</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {operators.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                No tow companies have signed up yet
              </td>
            </tr>
          )}
          {operators.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium">{o.businessName}</p>
                <p className="text-xs text-muted-foreground">{o.phone}</p>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{o.city ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{o.completedJobs}</td>
              <td className="px-4 py-3 capitalize">
                {o.status}
                {o.status === "active" && o.isAvailable && <span className="ml-1 text-xs text-muted-foreground">· online</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  {o.status !== "active" && (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => update(o.id, "active")}>
                      Approve
                    </Button>
                  )}
                  {o.status === "active" && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(o.id, "suspended")}>
                      Suspend
                    </Button>
                  )}
                  {o.status === "suspended" && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(o.id, "active")}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
