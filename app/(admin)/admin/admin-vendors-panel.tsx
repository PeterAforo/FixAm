"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { Button } from "@/components/brand/button"
import { adminSetVendorStatus } from "@/lib/vendors/actions"

type VendorRow = {
  id: string; businessName: string; slug: string; phone: string | null
  email: string | null; city: string | null; region: string | null
  categories: string[] | null; status: string
  ratingAvg: number | null; ratingCount: number | null; createdAt: string
}

export function AdminVendorsPanel({ vendors }: { vendors: VendorRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState("pending")
  const [msg, setMsg] = useState<string | null>(null)

  const shown = vendors.filter((v) => !filter || v.status === filter)

  function setStatus(vendorId: string, status: "approved" | "suspended" | "pending") {
    startTransition(async () => {
      const res = await adminSetVendorStatus({ vendorId, status })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null); router.refresh()
    })
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        {["pending", "approved", "suspended", ""].map((f) => (
          <button key={f || "all"} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {f || "All"}
          </button>
        ))}
      </div>
      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No vendors</td></tr>}
              {shown.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{v.businessName}</p><p className="text-xs text-muted-foreground">{v.slug}</p></td>
                  <td className="px-4 py-3 text-xs">{v.phone ?? "—"}<br />{v.email ?? ""}</td>
                  <td className="px-4 py-3 text-xs">{[v.city, v.region].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs">{(v.categories ?? []).join(", ") || "—"}</td>
                  <td className="px-4 py-3"><StatusPill status={v.status} tone={statusTone(v.status)} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {v.status !== "approved" && (
                        <Button variant="secondary" className="!min-h-8 px-2 text-xs" disabled={pending} onClick={() => setStatus(v.id, "approved")}>Approve</Button>
                      )}
                      {v.status === "approved" && (
                        <Button variant="ghost" className="!min-h-8 px-2 text-xs text-danger" disabled={pending} onClick={() => setStatus(v.id, "suspended")}>Suspend</Button>
                      )}
                      {v.status === "suspended" && (
                        <Button variant="ghost" className="!min-h-8 px-2 text-xs" disabled={pending} onClick={() => setStatus(v.id, "pending")}>Re-review</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
