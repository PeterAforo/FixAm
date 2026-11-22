import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { MapPin, Phone, Star } from "lucide-react"
import { garagePublicProfile } from "@/lib/discovery/directory"

async function ProfileContent({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  const g = await garagePublicProfile(slug)
  if (!g) notFound()

  const mapsUrl =
    g.gpsLat != null && g.gpsLng != null
      ? `https://www.openstreetmap.org/?mlat=${g.gpsLat}&mlon=${g.gpsLng}#map=16/${g.gpsLat}/${g.gpsLng}`
      : null

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/garages" className="text-sm font-semibold text-primary hover:underline">← All garages</Link>

      <header className="mt-4 overflow-hidden rounded-2xl border-2 border-border bg-card shadow-chunky">
        <div className="h-2" style={{ background: g.brandColor ?? "var(--color-primary)" }} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span
            className="flex size-16 items-center justify-center rounded-2xl border-2 border-border font-display text-2xl font-bold"
            style={{ backgroundColor: g.brandColor ?? "hsl(var(--primary) / 0.15)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary garage logo URL */}
            {g.logoUrl ? <img src={g.logoUrl} alt="" className="size-full rounded-2xl object-cover" /> : g.name.charAt(0)}
          </span>
          <div>
            <h1 className="font-display text-3xl font-extrabold">{g.name}</h1>
            <p className="text-muted-foreground">{[g.city, g.region].filter(Boolean).join(", ")}</p>
            {g.ratingAvg != null && (
              <p className="mt-1 flex items-center gap-1 text-sm font-bold">
                <Star className="size-4 fill-warning text-warning" /> {g.ratingAvg}
                <span className="font-normal text-muted-foreground">· {g.reviewCount} review{g.reviewCount === 1 ? "" : "s"}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {g.phone && (
            <a href={`tel:${g.phone}`} className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold hover:bg-surface-muted">
              <Phone className="size-4" /> {g.phone}
            </a>
          )}
          <Link
            href={g.bookingUrl}
            className="rounded-xl border-2 border-border bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            Book online
          </Link>
        </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border-2 border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">About</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {[g.address, g.city].filter(Boolean).join(", ") || "Contact the garage for directions."}
          </p>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              <MapPin className="size-4" /> View on map
            </a>
          )}
          {g.branches.length > 1 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold">Branches</h3>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {g.branches.map((b, i) => (
                  <li key={i}>{b.name}{b.address ? ` — ${b.address}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl border-2 border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Services</h2>
          {g.services.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">General repairs and servicing — call for details.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {g.services.map((s) => (
                <li key={s} className="rounded-pill border border-border bg-surface-muted px-3 py-1 text-xs font-semibold">{s}</li>
              ))}
            </ul>
          )}
          {g.coverage.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold">Vehicles serviced</h3>
              <p className="mt-1 text-sm text-muted-foreground">{g.coverage.join(" · ")}</p>
            </div>
          )}
        </section>
      </div>

      {g.reviews.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Reviews</h2>
          <div className="mt-3 space-y-3">
            {g.reviews.map((r, i) => (
              <div key={i} className="rounded-2xl border-2 border-border bg-card p-4">
                <p className="flex items-center gap-1 text-sm font-bold">
                  {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{r.createdAt}</span>
                </p>
                {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Listed on FixAm · <Link href="/onboarding" className="underline">Are you a garage? Get listed →</Link>
      </p>
    </div>
  )
}

export default function GarageProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<div className="p-10"><div className="mx-auto h-96 max-w-4xl animate-pulse rounded-2xl bg-muted" /></div>}>
        <ProfileContent params={params} />
      </Suspense>
    </main>
  )
}
