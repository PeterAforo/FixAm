import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getPartsShopContext } from "@/lib/parts-shop/actions"
import { getClaimFormData, getMyClaim } from "@/lib/claims/actions"
import { ClaimWizard } from "../../claim-wizard"

function toLocalInput(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

async function Loader({ claimId }: { claimId: string }) {
  await connection()
  const [ctx, form, data] = await Promise.all([getPartsShopContext(), getClaimFormData(), getMyClaim(claimId)])
  if (!ctx || !form || !data) redirect("/onboarding/driver")
  if (data.claim.status !== "draft") notFound()
  const { claim } = data
  const op = (claim.otherParty ?? {}) as { name?: string | null; phone?: string | null; plate?: string | null; insurer?: string | null }
  return (
    <ClaimWizard
      vehicles={form.vehicles.map((v) => ({ id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model, year: v.year }))}
      brokers={form.brokers}
      garages={ctx.myGarages.map((g) => ({ id: g.id, name: g.name, city: g.city ?? null }))}
      initialClaimId={claim.id}
      initial={{
        occurredAt: claim.occurredAt ? toLocalInput(claim.occurredAt) : "",
        location: claim.location ?? "",
        lat: claim.lat,
        lng: claim.lng,
        policeReportNo: claim.policeReportNo ?? "",
        otherPartyName: op.name ?? "",
        otherPartyPhone: op.phone ?? "",
        otherPartyPlate: op.plate ?? "",
        otherPartyInsurer: op.insurer ?? "",
        injuries: claim.injuries == null ? "" : claim.injuries ? "yes" : "no",
        description: claim.description ?? "",
        vehicleId: claim.vehicleId ?? "",
        vehicleRef: claim.vehicleRef === "Vehicle" ? "" : claim.vehicleRef,
        garageId: claim.garageId ?? "",
        brokerId: claim.brokerId ?? "",
      }}
    />
  )
}

export default function EditClaimPage(props: { params: Promise<{ claimId: string }> }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Finish your claim</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off — your draft saved itself.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <LoaderInner params={props.params} />
      </Suspense>
    </div>
  )
}

async function LoaderInner({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params
  return <Loader claimId={claimId} />
}
