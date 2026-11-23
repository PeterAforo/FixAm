import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { getPublicShop } from "@/lib/shop/actions"
import { OrderPanel } from "./order-panel"

async function Loader({ params, searchParams }: { params: Promise<{ garageSlug: string }>; searchParams: Promise<{ payment?: string }> }) {
  await connection()
  const { garageSlug } = await params
  const { payment } = await searchParams
  const res = await getPublicShop({ garageSlug })
  if (!res.ok) notFound()
  return (
    <>
      {payment === "success" && <PaymentBanner tone="ok" text="Payment received — FixAm holds it until the garage confirms your part arrived." />}
      {payment === "pending" && <PaymentBanner tone="wait" text="Waiting for your payment to confirm. You'll get an SMS once it does." />}
      {payment === "failed" && <PaymentBanner tone="bad" text="The payment didn't go through. You can try again below." />}
      <OrderPanel garageSlug={garageSlug} data={res.data} />
    </>
  )
}

function PaymentBanner({ tone, text }: { tone: "ok" | "wait" | "bad"; text: string }) {
  const cls = tone === "ok" ? "bg-emerald-50 text-emerald-900" : tone === "wait" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-900"
  return <div className={`mx-auto mt-4 max-w-5xl rounded-xl px-4 py-3 text-sm font-medium ${cls}`}>{text}</div>
}

export default function OrderPage({ params, searchParams }: { params: Promise<{ garageSlug: string }>; searchParams: Promise<{ payment?: string }> }) {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<div className="mx-auto max-w-5xl p-8"><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>}>
        <Loader params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
