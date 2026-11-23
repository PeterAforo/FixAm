"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import {
  cancelRenewal,
  completeRenewal,
  requestRenewalDocuments,
  sendRenewalQuote,
  startRenewalProcessing,
} from "@/lib/renewals/actions"
import {
  garageRespondToQuote,
  garageSendRenewalToBroker,
  listBrokersFor,
  type BrokerRequestView,
  type BrokerView,
} from "@/lib/brokers/actions"
import { REQUEST_STATUS } from "@/lib/brokers/catalog"
import { BadgeCheck, ShieldCheck } from "lucide-react"

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

type Renewal = {
  id: string
  number: string
  kind: "insurance" | "dvla"
  dvlaRecordType: string | null
  insurancePolicyType: string | null
  status: string
  officialFee: number | null
  serviceFee: number | null
  total: number | null
  customerName: string
  customerPhone: string | null
  plate: string | null
  vehicleLabel: string
  requiredDocuments: string[] | null
  createdAt: Date
}

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "new", label: "New", statuses: ["requested"] },
  { key: "docs", label: "Docs", statuses: ["documents_pending", "quote_pending"] },
  { key: "quote", label: "Quoted", statuses: ["quote_sent", "awaiting_payment"] },
  { key: "pay", label: "Paid", statuses: ["paid", "processing"] },
  { key: "done", label: "Done", statuses: ["completed", "cancelled", "failed"] },
]

const fmt = (p: number | null) => (p != null ? `GH₵ ${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "—")
const kindLabel = (r: Renewal) => r.kind === "insurance" ? "Insurance" : (r.dvlaRecordType ?? "DVLA").replace(/_/g, " ")

type BrokerJob = BrokerRequestView & { brokerName: string; brokerPhone: string }

export function RenewalsPanel({ garageId, renewals, brokerJobs = [], canProcess }: {
  garageId: string
  garageSlug: string
  renewals: Renewal[]
  brokerJobs?: BrokerJob[]
  canProcess: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [quoteFor, setQuoteFor] = useState<string | null>(null)
  const [quoteForm, setQuoteForm] = useState({ officialFee: "", serviceFee: "", notes: "" })
  const [completeFor, setCompleteFor] = useState<string | null>(null)
  const [completeForm, setCompleteForm] = useState({ referenceNumber: "", insurerName: "", dvlaExpiryDate: "", preInspectionJobId: "" })
  const [handoffFor, setHandoffFor] = useState<string | null>(null)
  const [handoffBrokers, setHandoffBrokers] = useState<BrokerView[] | null>(null)
  const [handoffBroker, setHandoffBroker] = useState("")
  const [handoffNote, setHandoffNote] = useState("")

  const jobFor = (renewalId: string) => brokerJobs.find((j) => j.renewalRequestId === renewalId)

  function openHandoff(r: Renewal) {
    if (handoffFor === r.id) return setHandoffFor(null)
    setHandoffFor(r.id); setQuoteFor(null); setCompleteFor(null)
    setHandoffBrokers(null); setHandoffBroker(""); setHandoffNote("")
    listBrokersFor({ kind: r.kind }).then((list) => {
      setHandoffBrokers(list)
      setHandoffBroker(list[0]?.id ?? "")
    })
  }

  function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okText: string) {
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setMsg(res.error?.message ?? "Failed"); return }
      setMsg(okText)
      setQuoteFor(null); setCompleteFor(null); setHandoffFor(null)
      router.refresh()
    })
  }

  function submitQuote(renewalId: string) {
    act(() => sendRenewalQuote({
      garageId, renewalId,
      officialFee: Math.round(Number(quoteForm.officialFee) * 100),
      serviceFee: Math.round(Number(quoteForm.serviceFee) * 100),
      notes: quoteForm.notes || undefined,
    }), "Quote sent — customer can pay via link")
  }

  function submitComplete(r: Renewal) {
    act(() => completeRenewal({
      garageId, renewalId: r.id,
      referenceNumber: completeForm.referenceNumber || undefined,
      insurerName: completeForm.insurerName || undefined,
      dvlaExpiryDate: completeForm.dvlaExpiryDate || undefined,
      preInspectionJobId: completeForm.preInspectionJobId || undefined,
    }), "Renewal completed — next reminders scheduled")
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Renewals</h1>
          <p className="text-sm text-muted-foreground">Insurance &amp; DVLA agent renewals</p>
        </div>
        {msg && <p className="text-sm font-semibold text-success">{msg}</p>}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = renewals.filter((r) => col.statuses.includes(r.status))
          return (
            <div key={col.key} className="rounded-xl bg-surface-muted/50 p-3">
              <h2 className="px-1 text-xs font-semibold text-muted-foreground">
                {col.label} <span className="ml-1">({items.length})</span>
              </h2>
              <div className="mt-2 space-y-2">
                {items.map((r) => (
                  <Card key={r.id}><CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{r.number}</p>
                        <p className="text-xs text-muted-foreground">{kindLabel(r)} · {r.vehicleLabel}</p>
                      </div>
                      <StatusPill status={r.status.replace(/_/g, " ")} />
                    </div>
                    <p className="mt-1 text-xs">{r.customerName}{r.customerPhone ? ` · ${r.customerPhone}` : ""}</p>
                    {r.total != null && <p className="mt-1 text-xs font-semibold">{fmt(r.total)}</p>}
                    {r.requiredDocuments?.length ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Docs: {r.requiredDocuments.join(", ").replace(/_/g, " ")}</p>
                    ) : null}

                    {(() => {
                      const job = jobFor(r.id)
                      if (!job) return null
                      const st = REQUEST_STATUS[job.status]
                      return (
                        <div className="mt-2 rounded-lg border border-[#DCD2FF] bg-[#F6F3FF] p-2 text-xs dark:border-[#5B3CC4]/40 dark:bg-[#5B3CC4]/15">
                          <p className="flex items-center gap-1 font-semibold text-[#5B3CC4] dark:text-[#B9A5FF]">
                            <ShieldCheck className="size-3.5" /> {job.brokerName}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {st?.label ?? job.status}{job.total != null ? ` · ${fmt(job.total)}` : ""}{job.completionRef ? ` · ref ${job.completionRef}` : ""}
                          </p>
                          {job.status === "quoted" && canProcess && (
                            <div className="mt-1.5 flex gap-1">
                              <Button size="sm" disabled={pending} onClick={() => act(() => garageRespondToQuote({ garageId, requestId: job.id, action: "accept" }), "Broker quote accepted")}>Accept</Button>
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => garageRespondToQuote({ garageId, requestId: job.id, action: "cancel" }), "Broker quote declined")}>Decline</Button>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {canProcess && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.status === "requested" && (
                          <Button size="sm" variant="secondary" disabled={pending}
                            onClick={() => act(() => requestRenewalDocuments({ garageId, renewalId: r.id }), "Documents requested")}>
                            Request docs
                          </Button>
                        )}
                        {["requested", "documents_pending", "quote_pending"].includes(r.status) && (
                          <Button size="sm" disabled={pending} onClick={() => { setQuoteFor(quoteFor === r.id ? null : r.id); setCompleteFor(null) }}>
                            Quote
                          </Button>
                        )}
                        {["requested", "documents_pending", "quote_pending"].includes(r.status) && !(() => { const j = jobFor(r.id); return j && ["requested", "quoted", "accepted", "in_progress"].includes(j.status) })() && (
                          <Button size="sm" variant="secondary" disabled={pending} onClick={() => openHandoff(r)}>
                            Send to broker
                          </Button>
                        )}
                        {["quote_sent", "awaiting_payment"].includes(r.status) && (
                          <span className="text-[11px] text-muted-foreground">Awaiting payment{r.total != null ? ` · ${fmt(r.total)}` : ""}</span>
                        )}
                        {r.status === "paid" && (
                          <Button size="sm" disabled={pending}
                            onClick={() => act(() => startRenewalProcessing({ garageId, renewalId: r.id }), "Processing")}>
                            Start processing
                          </Button>
                        )}
                        {r.status === "processing" && (
                          <Button size="sm" disabled={pending} onClick={() => { setCompleteFor(completeFor === r.id ? null : r.id); setQuoteFor(null) }}>
                            Complete
                          </Button>
                        )}
                        {["requested", "documents_pending", "quote_pending", "quote_sent", "awaiting_payment"].includes(r.status) && (
                          <Button size="sm" variant="ghost" disabled={pending}
                            onClick={() => act(() => cancelRenewal({ garageId, renewalId: r.id }), "Cancelled")}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}

                    {quoteFor === r.id && (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2">
                        <input className={inputCls} type="number" min={0} step="0.01" placeholder="Official fee GH₵ *" value={quoteForm.officialFee} onChange={(e) => setQuoteForm({ ...quoteForm, officialFee: e.target.value })} />
                        <input className={inputCls} type="number" min={0} step="0.01" placeholder="Service fee GH₵" value={quoteForm.serviceFee} onChange={(e) => setQuoteForm({ ...quoteForm, serviceFee: e.target.value })} />
                        <input className={inputCls} placeholder="Notes" value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
                        <Button size="sm" disabled={pending || !quoteForm.officialFee} onClick={() => submitQuote(r.id)}>Send quote</Button>
                      </div>
                    )}

                    {handoffFor === r.id && (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2">
                        <p className="text-[11px] text-muted-foreground">A licensed {r.kind === "dvla" ? "DVLA agent" : "insurance broker"} quotes and processes it; you approve the quote here.</p>
                        {handoffBrokers === null ? (
                          <div className="h-10 animate-pulse rounded-lg bg-muted" />
                        ) : handoffBrokers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No {r.kind === "dvla" ? "DVLA agents" : "brokers"} on FixAm yet.</p>
                        ) : (
                          <select className={inputCls} value={handoffBroker} onChange={(e) => setHandoffBroker(e.target.value)}>
                            {handoffBrokers.map((b) => (
                              <option key={b.id} value={b.id}>{b.businessName}{b.isVerified ? " ✓" : ""}{b.city ? ` · ${b.city}` : ""}</option>
                            ))}
                          </select>
                        )}
                        <input className={inputCls} placeholder="Note for the broker (optional)" value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} />
                        <Button size="sm" disabled={pending || !handoffBroker} onClick={() => act(() => garageSendRenewalToBroker({ garageId, renewalId: r.id, brokerId: handoffBroker, notes: handoffNote }), "Sent to broker — they've been notified by SMS")}>
                          <BadgeCheck className="size-4" /> Send
                        </Button>
                      </div>
                    )}

                    {completeFor === r.id && (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2">
                        {r.kind === "insurance" && (
                          <>
                            <input className={inputCls} placeholder="Insurer name" value={completeForm.insurerName} onChange={(e) => setCompleteForm({ ...completeForm, insurerName: e.target.value })} />
                            <input className={inputCls} placeholder="Policy number" value={completeForm.referenceNumber} onChange={(e) => setCompleteForm({ ...completeForm, referenceNumber: e.target.value })} />
                          </>
                        )}
                        {r.kind === "dvla" && (
                          <>
                            <input className={inputCls} placeholder="Reference / certificate no." value={completeForm.referenceNumber} onChange={(e) => setCompleteForm({ ...completeForm, referenceNumber: e.target.value })} />
                            <input className={inputCls} type="date" value={completeForm.dvlaExpiryDate} onChange={(e) => setCompleteForm({ ...completeForm, dvlaExpiryDate: e.target.value })} title="New expiry date" />
                            {r.dvlaRecordType === "roadworthy" && (
                              <input className={inputCls} placeholder="Pre-inspection job ID (optional)" value={completeForm.preInspectionJobId} onChange={(e) => setCompleteForm({ ...completeForm, preInspectionJobId: e.target.value })} />
                            )}
                          </>
                        )}
                        <Button size="sm" disabled={pending} onClick={() => submitComplete(r)}>Save &amp; complete</Button>
                      </div>
                    )}
                  </CardContent></Card>
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-xs text-muted-foreground">Empty</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
