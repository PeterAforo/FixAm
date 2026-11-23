"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { adminUpdateBroker, type BrokerView } from "@/lib/brokers/actions"
import { kindLabel } from "@/lib/brokers/catalog"

type Row = BrokerView & { requests: number; createdAt: string }

export function AdminBrokersPanel({ brokers }: { brokers: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function update(brokerId: string, patch: { status?: "active" | "suspended"; isVerified?: boolean }) {
    start(async () => {
      const res = await adminUpdateBroker({ brokerId, ...patch })
      if (!res.ok) return setMsg(res.error.message)
      setMsg(null)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-border bg-card">
      {msg && <p className="border-b border-border bg-danger-subtle px-4 py-2 text-sm">{msg}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">Business</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Licences</th>
            <th className="px-4 py-3">Requests</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {brokers.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No brokers have signed up yet</td></tr>
          )}
          {brokers.map((b) => (
            <tr key={b.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <p className="flex items-center gap-1.5 font-medium">{b.businessName}{b.isVerified && <BadgeCheck className="size-4 text-[#4E6B07]" />}</p>
                <p className="text-xs text-muted-foreground">{b.phone} · {b.city ?? "—"}</p>
              </td>
              <td className="px-4 py-3">{kindLabel(b.kind)}</td>
              <td className="px-4 py-3 text-xs">
                {b.nicLicenceNumber && <p>NIC {b.nicLicenceNumber}</p>}
                {b.dvlaAgentNumber && <p>DVLA {b.dvlaAgentNumber}</p>}
                {!b.nicLicenceNumber && !b.dvlaAgentNumber && <span className="text-muted-foreground">None given</span>}
              </td>
              <td className="px-4 py-3 tabular-nums">{b.requests}</td>
              <td className="px-4 py-3 capitalize">{b.status}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant={b.isVerified ? "ghost" : "secondary"} disabled={pending} onClick={() => update(b.id, { isVerified: !b.isVerified })}>
                    {b.isVerified ? "Unverify" : "Verify"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(b.id, { status: b.status === "active" ? "suspended" : "active" })}>
                    {b.status === "active" ? "Suspend" : "Reactivate"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
