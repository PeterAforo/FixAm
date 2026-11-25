"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { createManualInvoice, issueInvoice, voidInvoice } from "@/lib/money/actions"

type Row = {
  id: string
  number: string | null
  status: string
  source: string
  total: number
  amountPaid: number
  balanceDue: number
  issueDate: string | null
  dueDate: string | null
  createdAt: string
  branchName: string | null
  customerName: string | null
}

const FILTERS = [
  ["", "All"],
  ["draft", "Draft"],
  ["issued", "Issued"],
  ["partially_paid", "Part paid"],
  ["paid", "Paid"],
  ["void", "Void"],
] as const

const STATUS_TONE: Record<string, "neutral" | "info" | "ok" | "warning" | "danger"> = {
  draft: "neutral",
  issued: "info",
  partially_paid: "warning",
  paid: "ok",
  void: "danger",
  written_off: "danger",
}

export function InvoicesPanel(props: {
  garageSlug: string
  garageId: string
  status: string
  q: string
  canCreate: boolean
  canIssue: boolean
  canVoid: boolean
  customers: { id: string; name: string; phone: string | null }[]
  rows: Row[]
}) {
  const { garageSlug, garageId, status, q, canCreate, canIssue, canVoid, customers, rows } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Row | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [payLink, setPayLink] = useState<{ number: string; url: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [custId, setCustId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState([{ type: "sundry" as const, description: "", quantity: "1", unitPrice: "", discountAmount: "0" }])

  function applyFilters(next: { status?: string; q?: string }) {
    const params = new URLSearchParams()
    const s = next.status ?? status
    const query = next.q ?? q
    if (s) params.set("status", s)
    if (query) params.set("q", query)
    router.push(`/g/${garageSlug}/invoices${params.size ? `?${params}` : ""}`)
  }

  function issue(row: Row) {
    startTransition(async () => {
      const res = await issueInvoice({ garageId, invoiceId: row.id, dueDays: 14 })
      if (!res.ok) { setMsg(res.error.message); return }
      const base = window.location.origin
      setPayLink({ number: res.data.number, url: `${base}/t/${res.data.payToken}` })
      router.refresh()
    })
  }

  function submitManual() {
    const payload = lines
      .filter((l) => l.description.trim() && parseFloat(l.unitPrice) > 0)
      .map((l) => ({
        type: l.type,
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: Math.round(parseFloat(l.unitPrice) * 100),
        discountAmount: Math.round(parseFloat(l.discountAmount || "0") * 100),
      }))
    if (payload.length === 0) { setMsg("Add at least one line with a price"); return }
    startTransition(async () => {
      const res = await createManualInvoice({
        garageId,
        customerId: custId || undefined,
        notes: notes || undefined,
        lines: payload,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setCreateOpen(false)
      setLines([{ type: "sundry", description: "", quantity: "1", unitPrice: "", discountAmount: "0" }])
      setNotes(""); setCustId(""); setMsg(null)
      router.push(`/g/${garageSlug}/invoices/${res.data.invoiceId}`)
    })
  }

  function confirmVoid() {
    if (!voidTarget) return
    startTransition(async () => {
      const res = await voidInvoice({ garageId, invoiceId: voidTarget.id, reason: voidReason })
      if (!res.ok) { setMsg(res.error.message); return }
      setVoidTarget(null); setVoidReason(""); setMsg(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Invoices</h1>
          <p className="text-sm text-muted-foreground">{rows.length} invoice{rows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2">
          {canCreate && <Button onClick={() => setCreateOpen(true)}>New invoice</Button>}
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); applyFilters({ q: (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value }) }}
          >
          <input
            name="q"
            defaultValue={q}
            placeholder="Search number, customer, phone…"
            className="min-h-10 w-64 rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
          />
          <Button type="submit" variant="secondary">Search</Button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => applyFilters({ status: value })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              status === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      {payLink && (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
          <p className="font-semibold">Invoice {payLink.number} issued.</p>
          <p className="mt-1 break-all text-muted-foreground">Pay link: {payLink.url}</p>
          <Button variant="secondary" className="mt-2" onClick={() => navigator.clipboard.writeText(payLink.url)}>Copy link</Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No invoices yet</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/g/${garageSlug}/invoices/${r.id}`} className="hover:underline">
                        {r.number ?? "Draft"}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{r.source}</span>
                    </td>
                    <td className="px-4 py-3">{r.customerName ?? "—"}</td>
                    <td className="px-4 py-3">{r.branchName ?? "—"}</td>
                    <td className="px-4 py-3">{r.issueDate ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGHS(r.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGHS(r.balanceDue)}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} tone={STATUS_TONE[r.status] ?? "neutral"} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {r.status === "draft" && canIssue && (
                          <Button variant="secondary" disabled={pending} onClick={() => issue(r)}>Issue</Button>
                        )}
                        {r.status !== "void" && r.status !== "draft" && canVoid && Number(r.amountPaid) === 0 && (
                          <Button variant="ghost" disabled={pending} onClick={() => { setVoidTarget(r); setVoidReason("") }}>Void</Button>
                        )}
                        <Link href={`/g/${garageSlug}/invoices/${r.id}`} className="text-sm text-primary hover:underline">View</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">New invoice</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Customer (optional)</span>
                <select value={custId} onChange={(e) => setCustId(e.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">Walk-in</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Notes</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[7rem_1fr_4.5rem_6rem_6rem_2rem] items-center gap-2">
                  <select
                    value={l.type}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, type: e.target.value as typeof l.type } : x))}
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="sundry">Sundry</option>
                    <option value="labour">Labour</option>
                    <option value="part">Part</option>
                    <option value="service_fee">Service fee</option>
                  </select>
                  <input
                    value={l.description}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    placeholder="Description"
                    className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <input
                    value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                    placeholder="Qty"
                    inputMode="decimal"
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <input
                    value={l.unitPrice}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))}
                    placeholder="Price GH₵"
                    inputMode="decimal"
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <input
                    value={l.discountAmount}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, discountAmount: e.target.value } : x))}
                    placeholder="Disc GH₵"
                    inputMode="decimal"
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <button
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Remove line"
                  >✕</button>
                </div>
              ))}
              <Button variant="ghost" onClick={() => setLines([...lines, { type: "sundry", description: "", quantity: "1", unitPrice: "", discountAmount: "0" }])}>
                + Add line
              </Button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={pending} onClick={submitManual}>Create draft</Button>
            </div>
          </div>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Void {voidTarget.number ?? "invoice"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">This cannot be undone. A reason is required.</p>
            <input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason (e.g. raised in error)"
              className="mt-4 min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVoidTarget(null)}>Cancel</Button>
              <Button variant="danger" disabled={pending || voidReason.trim().length < 3} onClick={confirmVoid}>Void invoice</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
