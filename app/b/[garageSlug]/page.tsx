import { Suspense } from "react"
import { getPublicBookingInfo } from "@/lib/bookings/actions"
import { BookingForm } from "./booking-form"

async function BookingView({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  const res = await getPublicBookingInfo({ garageSlug })
  const info = res.ok ? res.data : null

  if (!info) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold">Garage not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This booking page doesn&rsquo;t exist or the garage isn&rsquo;t taking bookings.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-8">
        <header className="mb-6 text-center">
          <h1 className="font-display text-3xl font-bold">Book with {info.garageName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a service, a day and a time — we&rsquo;ll confirm by SMS.</p>
        </header>
        <BookingForm garageId={info.garageId} garageName={info.garageName} garagePhone={info.garagePhone} branches={info.branches} services={info.services} />
      </div>
    </main>
  )
}

export default function PublicBookingPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <BookingView params={params} />
    </Suspense>
  )
}
