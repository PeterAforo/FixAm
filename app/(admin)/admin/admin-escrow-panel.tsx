"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { adminDecideHold, adminRetryPayout, type AdminEscrowView } from "@/lib/escrow/actions"

export function AdminEscrowPanel({ view }: { view: AdminEscrowView }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<{ id: string; decision: "release" | "refund" } | null>(null)
  const [note, setNote] = useState("")

  const disputed = view.holds.filter((h) => h.status === "disputed")
  const held = view.holds.filter((h) => h.status === "held")

  function decide() {
    if (!deciding) return
    startTransition(async () => {
      const r = await adminDecideHold({ holdId: deciding.id, decision: deciding.decision, note })
      setMsg(r.ok ? (deciding.decision === "release" ? "Released to the vendor" : "Refund started") : r.error.message)
      if (r.ok) {
        setDeciding(null)
        setNote("")
        router.refresh()
      }
    })
  }

  function retry(id: string) {
    startTransition(async () => {
      const r = await adminRetryPayout(id)
      setMsg(r.ok ? r.data.message : r.error.message)
      router.refresh()
    })
  }

  const holdRow = (h: AdminEscrowView["holds"][number]) => (
    <tr key={h.id} className="border-t border-border align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{h.orderNumber ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{h.garageName ?? "Driver"} → {h.vendorName ?? "Vendor"}</div>
        {h.disputeReason && <div className="mt-1 max-w-sm text-xs text-red-700">“{h.disputeReason}”</div>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatGHS(h.gross)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatGHS(h.commission)}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {h.releaseAfter ? `Auto-release ${new Date(h.releaseAfter).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Awaiting delivery"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDeciding({ id: h.id, decision: "release" })}>Release</Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDeciding({ id: h.id, decision: "refund" })}>Refund</Button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="mt-4 space-y-6">
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {deciding && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">{deciding.decision === "release" ? "Release funds to the vendor" : "Refund the buyer"}</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason (kept in the audit log)"
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <div className="mt-2 flex gap-2">
            <Button disabled={pending || note.trim().length < 3} onClick={decide}>Confirm</Button>
            <Button variant="secondary" disabled={pending} onClick={() => setDeciding(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {[{ title: `Disputes (${disputed.length})`, rows: disputed }, { title: `Held (${held.length})`, rows: held }].map((group) => (
        <div key={group.title}>
          <h3 className="text-sm font-semibold">{group.title}</h3>
          {group.rows.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Commission</th><th className="px-3 py-2">Timer</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>{group.rows.map(holdRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <div>
        <h3 className="text-sm font-semibold">Payouts in progress ({view.payouts.length})</h3>
        {view.payouts.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">All payouts are settled.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2">Created</th><th className="px-3 py-2">Purpose</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {view.payouts.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">{new Date(p.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</td>
                    <td className="px-3 py-2">{p.purpose.replace("_", " ")} · {p.method === "bank" ? "Bank" : "MoMo"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatGHS(p.amount)}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={p.status.replace("_", " ")} tone={p.status === "needs_attention" ? "danger" : "info"} />
                      {p.lastError && <div className="mt-1 text-xs text-muted-foreground">{p.lastError} · {p.attempts} attempt{p.attempts === 1 ? "" : "s"}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "needs_attention" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => retry(p.id)}>Retry</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
