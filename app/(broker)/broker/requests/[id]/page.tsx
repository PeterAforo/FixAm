import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { ArrowLeft, Car, MessageCircle, Phone, Store, UserRound } from "lucide-react"
import { getBrokerRequestDetail } from "@/lib/brokers/actions"
import { REQUEST_STATUS } from "@/lib/brokers/catalog"
import { formatGHS } from "@/lib/money"
import { StatusPill } from "@/components/brand/status-pill"
import { RequestActions } from "./request-actions"

type Params = Promise<{ id: string }>

const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`

async function Detail({ params }: { params: Params }) {
  await connection()
  const { id } = await params
  const d = await getBrokerRequestDetail(id)
  if (!d) notFound()
  const r = d.request
  const st = REQUEST_STATUS[r.status]

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <Link href="/broker/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md border-[1.5px] border-foreground bg-white px-2.5 py-0.5 font-mono text-sm font-semibold text-[#16130F]">{r.vehiclePlate}</span>
            <StatusPill tone={st?.tone ?? "neutral"}>{st?.label ?? r.status}</StatusPill>
          </div>
          <h1 className="mt-3 font-display text-[28px] font-bold leading-tight tracking-[-0.03em]">
            {r.kind === "dvla" ? "DVLA" : "Insurance"} · {r.serviceLabel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {r.number} · received {new Date(r.createdAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        {r.total != null && (
          <div className="rounded-[18px] bg-[linear-gradient(135deg,#FF7A3D,#D4430F)] px-5 py-4 text-white shadow-[0_16px_40px_-16px_rgba(212,67,15,0.7)]">
            <p className="text-xs text-white/85">Quote total{r.paidAt ? " · paid" : ""}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatGHS(r.total)}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <RequestActions request={r} defaultServiceFee={d.broker.defaultServiceFee} insurers={d.broker.insurers} />

          <section className="rounded-[18px] border border-border bg-card p-5">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-4 space-y-4">
              {d.events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pl-1">
                  <span className="relative mt-1.5 flex flex-col items-center">
                    <span className="size-2.5 rounded-full bg-primary" />
                    {i < d.events.length - 1 && <span className="absolute top-3 h-[calc(100%+12px)] w-px bg-border" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {REQUEST_STATUS[e.status]?.label ?? e.status}
                      <span className="font-normal text-muted-foreground"> · {e.actor === "broker" ? "you" : e.actor}</span>
                    </p>
                    {e.note && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{e.note}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[18px] border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              {r.source === "garage" ? <Store className="size-4" /> : <UserRound className="size-4" />}
              {r.source === "garage" ? "From a garage" : "From a driver"}
            </h2>
            <p className="mt-3 text-[15px] font-semibold">{r.requesterName}</p>
            <p className="text-sm text-muted-foreground">{r.requesterPhone.replace("+233", "0")}</p>
            <div className="mt-4 flex gap-2">
              <a href={`tel:${r.requesterPhone}`} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-border text-sm font-medium hover:bg-surface-muted">
                <Phone className="size-4" /> Call
              </a>
              <a
                href={waLink(r.requesterPhone, `Hello ${r.requesterName.split(" ")[0]}, this is ${d.broker.businessName} about your ${r.serviceLabel.toLowerCase()} renewal for ${r.vehiclePlate} (${r.number}).`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] text-sm font-semibold text-white hover:brightness-95"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </div>
          </section>

          <section className="rounded-[18px] border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Car className="size-4" /> Vehicle</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Plate</dt><dd className="font-mono font-semibold">{r.vehiclePlate}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Vehicle</dt><dd>{r.vehicleLabel || "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Current expiry</dt><dd>{r.currentExpiry ?? "—"}</dd></div>
              {r.newExpiry && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">New expiry</dt><dd className="font-semibold">{r.newExpiry}</dd></div>}
              {r.completionRef && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{r.completionRef}</dd></div>}
            </dl>
            {r.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-surface-muted px-3.5 py-3 text-sm">{r.notes}</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}

export default function BrokerRequestPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <Detail params={params} />
    </Suspense>
  )
}
