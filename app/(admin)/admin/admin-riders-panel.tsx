"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck, KeyRound } from "lucide-react"
import { Button } from "@/components/brand/button"
import { adminSetRiderStatus } from "@/lib/riders/actions"

type Row = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  bikePlate: string | null
  status: string
  ghanaCardLast4: string | null
  ghanaCardVerified: boolean
  isOnline: boolean
  completedJobs: number
  createdAt: string
}

export function AdminRidersPanel({ riders }: { riders: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [cardFor, setCardFor] = useState<string | null>(null)
  const [cardNo, setCardNo] = useState("")

  function update(riderId: string, patch: { status?: "active" | "suspended" | "pending"; verifyGhanaCard?: boolean; ghanaCardNumber?: string }) {
    start(async () => {
      const res = await adminSetRiderStatus({ riderId, ...patch })
      if (!res.ok) return setMsg(res.error)
      setMsg(null)
      setCardFor(null); setCardNo("")
      router.refresh()
    })
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-border bg-card">
      {msg && <p className="border-b border-border bg-danger-subtle px-4 py-2 text-sm">{msg}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">Rider</th>
            <th className="px-4 py-3">Bike</th>
            <th className="px-4 py-3">Ghana Card</th>
            <th className="px-4 py-3">Jobs</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {riders.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No riders have signed up yet</td></tr>
          )}
          {riders.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 align-top">
              <td className="px-4 py-3">
                <p className="font-medium">{r.name ?? "—"}{r.isOnline && <span className="ml-2 text-xs font-semibold text-[#4E6B07]">● online</span>}</p>
                <p className="text-xs text-muted-foreground">{r.phone ?? r.email ?? "—"}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{r.bikePlate ?? "—"}</td>
              <td className="px-4 py-3 text-xs">
                {r.ghanaCardLast4 ? (
                  <span className="inline-flex items-center gap-1">
                    •••• {r.ghanaCardLast4}
                    {r.ghanaCardVerified && <BadgeCheck className="size-4 text-[#4E6B07]" />}
                  </span>
                ) : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums">{r.completedJobs}</td>
              <td className="px-4 py-3 capitalize">{r.status}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {r.status === "pending" && (
                    <Button size="sm" disabled={pending} onClick={() => update(r.id, { status: "active" })}>Approve</Button>
                  )}
                  {!r.ghanaCardVerified && r.ghanaCardLast4 && cardFor !== r.id && (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setCardFor(r.id); setCardNo("") }}>
                      <KeyRound className="size-3.5" /> Verify card
                    </Button>
                  )}
                  {r.status === "active" ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(r.id, { status: "suspended" })}>Suspend</Button>
                  ) : r.status === "suspended" ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(r.id, { status: "active" })}>Reactivate</Button>
                  ) : null}
                </div>
                {cardFor === r.id && (
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <input
                      value={cardNo}
                      onChange={(e) => setCardNo(e.target.value)}
                      placeholder="GHA-000000000-0"
                      className="min-h-9 w-40 rounded-lg border border-input bg-surface px-2 font-mono text-xs outline-none"
                      autoComplete="off"
                    />
                    <Button size="sm" disabled={pending || !cardNo.trim()}
                      onClick={() => update(r.id, { verifyGhanaCard: true, ghanaCardNumber: cardNo })}>Check</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
