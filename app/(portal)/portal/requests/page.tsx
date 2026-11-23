import { Suspense } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { getPartsShopContext } from "@/lib/parts-shop/actions"
import { listMyRepairRequests } from "@/lib/repair-requests/actions"
import { RequestsPanel } from "./requests-panel"
import { getMyScan } from "@/lib/obd/actions"

async function Loader({ searchParams }: { searchParams: Promise<{ new?: string; scan?: string }> }) {
  await connection()
  const [ctx, requests, sp] = await Promise.all([getPartsShopContext(), listMyRepairRequests(), searchParams])
  if (!ctx) redirect("/onboarding/driver")
  const scan = sp.scan ? await getMyScan(sp.scan).catch(() => null) : null
  return (
    <RequestsPanel
      cars={ctx.cars}
      myGarages={ctx.myGarages}
      requests={requests}
      startOpen={sp.new === "1" || !!scan || requests.length === 0}
      attachedScan={scan ? { id: scan.id, codes: scan.codes, summary: scan.summary } : null}
    />
  )
}

export default function RequestsPage(props: { searchParams: Promise<{ new?: string; scan?: string }> }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Get my car fixed</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us what&apos;s wrong — type it or say it in Twi, Ga, Ewe, Hausa or English. FixAm explains the likely cause and cost, then garages send you offers.
      </p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}
