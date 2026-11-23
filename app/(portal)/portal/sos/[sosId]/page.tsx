import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { getMySos } from "@/lib/towing/actions"
import { getPartsShopContext } from "@/lib/parts-shop/actions"
import { SosTracker } from "./sos-tracker"

async function Loader({ params, searchParams }: { params: Promise<{ sosId: string }>; searchParams: Promise<{ payment?: string }> }) {
  await connection()
  const [{ sosId }, sp] = await Promise.all([params, searchParams])
  const [view, ctx] = await Promise.all([getMySos(sosId), getPartsShopContext()])
  if (!view) notFound()
  return <SosTracker initial={view} myGarages={ctx?.myGarages ?? []} payment={sp.payment ?? null} />
}

export default function SosTrackPage(props: { params: Promise<{ sosId: string }>; searchParams: Promise<{ payment?: string }> }) {
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/portal/sos" className="text-sm text-muted-foreground underline">← Breakdown help</Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader {...props} />
      </Suspense>
    </div>
  )
}
