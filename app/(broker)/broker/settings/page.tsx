import { Suspense } from "react"
import { connection } from "next/server"
import { getMyBroker } from "@/lib/brokers/actions"
import { BrokerSettingsForm } from "./settings-form"

async function Settings() {
  await connection()
  const mine = await getMyBroker()
  if (!mine) return null
  return (
    <div className="mx-auto max-w-[860px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[-0.03em]">Business profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">What drivers and garages see when they choose a broker.</p>
      </div>
      <BrokerSettingsForm broker={mine.broker} canEdit={mine.role === "owner"} />
    </div>
  )
}

export default function BrokerSettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[860px] animate-pulse rounded-2xl bg-muted" />}>
      <Settings />
    </Suspense>
  )
}
