import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { getPublicShop } from "@/lib/shop/actions"
import { OrderPanel } from "./order-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const res = await getPublicShop({ garageSlug })
  if (!res.ok) notFound()
  return <OrderPanel garageSlug={garageSlug} data={res.data} />
}

export default function OrderPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<div className="mx-auto max-w-5xl p-8"><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>}>
        <Loader params={params} />
      </Suspense>
    </main>
  )
}
