"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, CircleDollarSign, FileCheck2, PlayCircle, Send, XCircle } from "lucide-react"
import { Button } from "@/components/brand/button"
import { brokerQuote, brokerUpdateRequest, type BrokerRequestView } from "@/lib/brokers/actions"
import { formatGHS } from "@/lib/money"

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

function Money({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <span className="flex h-11 overflow-hidden rounded-xl border border-input bg-card focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
      <span className="flex items-center border-r border-input bg-background px-3.5 text-sm font-medium">GH₵</span>
      <input autoFocus={autoFocus} className="min-w-0 flex-1 bg-transparent px-3.5 tabular-nums outline-none" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
    </span>
  )
}

export function RequestActions({
  request: r,
  defaultServiceFee,
  insurers,
}: {
  request: BrokerRequestView
  defaultServiceFee: number | null
  insurers: string[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [official, setOfficial] = useState(r.officialFee != null ? String(r.officialFee / 100) : "")
  const [service, setService] = useState(
    r.serviceFee != null ? String(r.serviceFee / 100) : defaultServiceFee != null ? String(defaultServiceFee / 100) : ""
  )
  const [insurer, setInsurer] = useState(r.insurerName ?? "")
  const [quoteNote, setQuoteNote] = useState(r.quoteNote ?? "")
  const [ref, setRef] = useState("")
  const [expiry, setExpiry] = useState("")
  const [note, setNote] = useState("")

  const total = (Number(official) || 0) + (Number(service) || 0)

  function run(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, msg: string) {
    setError(null)
    setDone(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error?.message ?? "Something went wrong")
      setDone(msg)
      setNote("")
      router.refresh()
    })
  }

  const canQuote = r.status === "requested" || r.status === "quoted"
  const isInsurance = r.kind === "insurance"

  return (
    <section className="rounded-[18px] border border-border bg-card p-5">
      {canQuote && (
        <>
          <h2 className="font-semibold">{r.status === "quoted" ? "Update your quote" : "Send a quote"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">We text the {r.source === "garage" ? "garage" : "driver"} a link to accept.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{isInsurance ? "Premium" : "DVLA fee"}</span>
              <Money value={official} onChange={setOfficial} autoFocus={r.status === "requested"} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Your service fee</span>
              <Money value={service} onChange={setService} />
            </label>
          </div>
          {isInsurance && (
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium">Insurer</span>
              <input list="insurers" className={inputCls} value={insurer} onChange={(e) => setInsurer(e.target.value)} placeholder="e.g. Enterprise Insurance" />
              <datalist id="insurers">{insurers.map((i) => <option key={i} value={i} />)}</datalist>
            </label>
          )}
          <label className="mt-4 block space-y-1.5">
            <span className="text-sm font-medium">Note for the customer (optional)</span>
            <textarea className={`${inputCls} h-20 resize-none py-2.5`} value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder="What's included, documents you need, turnaround time…" />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Total <span className="ml-1 font-display text-xl font-bold text-foreground tabular-nums">{formatGHS(Math.round(total * 100))}</span></p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => brokerUpdateRequest({ requestId: r.id, action: "decline", note: "Declined by broker" }), "Request declined")}
              >
                <XCircle className="size-4" /> Decline
              </Button>
              <Button
                type="button"
                loading={pending}
                disabled={!official}
                onClick={() =>
                  run(() => brokerQuote({ requestId: r.id, officialFee: Number(official) || 0, serviceFee: Number(service) || 0, insurerName: insurer, quoteNote }), "Quote sent by SMS")
                }
              >
                <Send className="size-4" /> {r.status === "quoted" ? "Resend quote" : "Send quote"}
              </Button>
            </div>
          </div>
        </>
      )}

      {r.status === "accepted" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Quote accepted 🎉</h2>
            <p className="mt-1 text-sm text-muted-foreground">Collect payment and documents, then start processing.</p>
          </div>
          <Button type="button" loading={pending} onClick={() => run(() => brokerUpdateRequest({ requestId: r.id, action: "start" }), "Marked as processing")}>
            <PlayCircle className="size-4" /> Start processing
          </Button>
        </div>
      )}

      {(r.status === "accepted" || r.status === "in_progress") && (
        <div className={r.status === "accepted" ? "mt-5 border-t border-border pt-5" : ""}>
          <h2 className="font-semibold">Complete the renewal</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add the {isInsurance ? "policy or sticker" : "receipt or certificate"} number and the new expiry date.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{isInsurance ? "Policy / sticker number" : "Reference number"}</span>
              <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Valid until</span>
              <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {!r.paidAt && (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => brokerUpdateRequest({ requestId: r.id, action: "mark_paid" }), "Payment recorded")}>
                <CircleDollarSign className="size-4" /> Mark as paid
              </Button>
            )}
            <Button
              type="button"
              variant="success"
              loading={pending}
              onClick={() => run(() => brokerUpdateRequest({ requestId: r.id, action: "complete", completionRef: ref, newExpiry: expiry }), "Renewal completed — customer notified")}
            >
              <FileCheck2 className="size-4" /> Mark complete
            </Button>
          </div>
        </div>
      )}

      {r.status === "completed" && (
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 text-[#4E6B07]" />
          <div>
            <h2 className="font-semibold">Completed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.completionRef ? `Ref ${r.completionRef}. ` : ""}{r.newExpiry ? `Valid until ${r.newExpiry}. ` : ""}{r.paidAt ? "Payment received." : "Payment not recorded yet."}
            </p>
            {!r.paidAt && (
              <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={pending} onClick={() => run(() => brokerUpdateRequest({ requestId: r.id, action: "mark_paid" }), "Payment recorded")}>
                Mark as paid
              </Button>
            )}
          </div>
        </div>
      )}

      {(r.status === "declined" || r.status === "cancelled") && (
        <p className="text-sm text-muted-foreground">This request was {r.status}. No further action needed.</p>
      )}

      {/* Internal note — any time */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex gap-2">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the timeline…" />
          <Button type="button" variant="secondary" disabled={!note || pending} onClick={() => run(() => brokerUpdateRequest({ requestId: r.id, action: "note", note }), "Note added")}>
            Add
          </Button>
        </div>
      </div>

      {done && <p className="mt-3 text-sm font-medium text-[#4E6B07]">{done}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-[#B3122F]">{error}</p>}
    </section>
  )
}
