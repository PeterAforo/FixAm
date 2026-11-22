import { Suspense } from "react"
import { MapPin, Phone } from "lucide-react"
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

  const accent = info.garageBrandColor ?? "var(--color-primary)"

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-8">
        <header className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="h-2" style={{ background: `linear-gradient(90deg, ${accent}, var(--color-primary))` }} />
          <div className="flex items-center gap-4 p-5">
            <div
              className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-xl font-bold text-white"
              style={{ background: accent }}
            >
              {info.garageLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.garageLogoUrl} alt="" className="size-full object-cover" />
              ) : (
                info.garageName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-bold">Book with {info.garageName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {info.garageAddress && (
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{info.garageAddress}</span>
                )}
                {info.garagePhone && (
                  <a href={`tel:${info.garagePhone}`} className="inline-flex items-center gap-1 font-medium text-primary">
                    <Phone className="size-3.5" />{info.garagePhone}
                  </a>
                )}
              </div>
            </div>
          </div>
          <p className="border-t border-border bg-surface-sunken px-5 py-3 text-sm text-muted-foreground">
            Pick a service, a day and a time — we&rsquo;ll confirm by SMS.
          </p>
        </header>
        <BookingForm garageId={info.garageId} garageName={info.garageName} garagePhone={info.garagePhone ?? ""} branches={info.branches} services={info.services} />
        <p className="mt-4 text-center text-sm">
          <a href={`/o/${garageSlug}`} className="font-medium text-primary underline underline-offset-2">Order parts online →</a>
        </p>
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
