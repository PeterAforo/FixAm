import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getMyClaim } from "@/lib/claims/actions"
import { CLAIM_STATUS_LABEL } from "@/lib/claims/core"
import { storageProvider } from "@/lib/integrations/storage"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { ClaimActions } from "./claim-actions"

async function Loader({ claimId }: { claimId: string }) {
  await connection()
  const data = await getMyClaim(claimId)
  if (!data) notFound()
  const { claim, events } = data
  const sp = storageProvider()
  const photoUrls = await Promise.all((claim.photos ?? []).map((k) => sp.getSignedUrl(k).catch(() => k)))
  const docUrls = await Promise.all((claim.documents ?? []).map((k) => sp.getSignedUrl(k).catch(() => k)))
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{claim.number} · {claim.vehicleRef}</h2>
          <StatusPill status={claim.status}>{CLAIM_STATUS_LABEL[claim.status as keyof typeof CLAIM_STATUS_LABEL] ?? claim.status}</StatusPill>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</dt><dd>{claim.occurredAt ? new Date(claim.occurredAt).toLocaleString("en-GH") : "—"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</dt><dd>{claim.location ?? "—"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Police report</dt><dd>{claim.policeReportNo ?? "—"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Injuries</dt><dd>{claim.injuries == null ? "—" : claim.injuries ? "Yes" : "No"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Handling</dt><dd>{claim.brokerName ? `Broker: ${claim.brokerName}` : claim.insurerName ? `Insurer: ${claim.insurerName}` : "Not yet assigned"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Garage</dt><dd>{claim.garageName ?? "Not chosen yet"}</dd></div>
          {claim.estimateAmount != null && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repair estimate</dt><dd>{formatGHS(BigInt(claim.estimateAmount))}</dd></div>}
          {claim.approvedAmount != null && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved</dt><dd>{formatGHS(BigInt(claim.approvedAmount))}</dd></div>}
          {claim.description && <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened</dt><dd className="mt-1 whitespace-pre-wrap">{claim.description}</dd></div>}
        </dl>
      </section>

      {photoUrls.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Your photos</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photoUrls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Claim photo ${i + 1}`} className="aspect-[4/3] w-full rounded-xl border border-border object-cover" /></a>
            ))}
          </div>
        </section>
      )}

      {docUrls.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Documents</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {docUrls.map((u, i) => <li key={i}><a className="text-primary underline" href={u} target="_blank" rel="noreferrer">Document {i + 1}</a></li>)}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-semibold">Progress</h2>
        <ol className="mt-3 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground/40" />
              <div>
                <p className="font-medium capitalize">{e.status.replace(/_/g, " ")} <span className="font-normal text-muted-foreground">· {e.actor}</span></p>
                {e.note && <p className="text-muted-foreground">{e.note}</p>}
                <p className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString("en-GH")}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ClaimActions claimId={claim.id} status={claim.status} />
    </div>
  )
}

async function Page({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/portal/claims" className="text-sm text-muted-foreground hover:text-foreground">← All claims</Link>
      <h1 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.02em]">Claim</h1>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader claimId={claimId} />
      </Suspense>
    </div>
  )
}

export default Page
