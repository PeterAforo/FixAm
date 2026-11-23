import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import {
  ArrowLeft,
  BadgeCheck,
  CalendarCheck,
  Car,
  ChevronRight,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Smartphone,
  Star,
  Wallet,
  Wrench,
} from "lucide-react"
import { garagePublicProfile } from "@/lib/discovery/directory"
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome"
import { GarageAvatar } from "../directory-browser"

function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= Math.round(value) ? "fill-[#FFB020] text-[#FFB020]" : "fill-[#ECE6DD] text-[#ECE6DD]"}`} />
      ))}
    </span>
  )
}

function waNumber(phone: string | null) {
  if (!phone) return null
  const d = phone.replace(/\D/g, "")
  if (d.startsWith("233")) return d
  if (d.startsWith("0")) return `233${d.slice(1)}`
  return d || null
}

async function ProfileContent({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  const g = await garagePublicProfile(slug)
  if (!g) notFound()

  const location = [g.city, g.region].filter(Boolean).join(", ")
  const hasGps = g.gpsLat != null && g.gpsLng != null
  const directionsUrl = hasGps
    ? `https://www.google.com/maps/dir/?api=1&destination=${g.gpsLat},${g.gpsLng}`
    : g.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([g.address, g.city].filter(Boolean).join(", "))}`
      : null
  const osmEmbed = hasGps
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${g.gpsLng! - 0.006}%2C${g.gpsLat! - 0.004}%2C${g.gpsLng! + 0.006}%2C${g.gpsLat! + 0.004}&layer=mapnik&marker=${g.gpsLat}%2C${g.gpsLng}`
    : null
  const wa = waNumber(g.phone)
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: g.reviews.filter((r) => r.rating === star).length,
  }))

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0B0F1A] text-[#F4F2EE]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(60% 80% at 85% 0%, ${g.brandColor ?? "#FF5A1F"}55 0%, transparent 70%)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <SiteHeader tone="dark" active="Find a garage" />
        <div className="relative mx-auto max-w-[1200px] px-6 pb-14 pt-6 md:px-8 md:pb-16">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[#9AA3BC]">
            <Link href="/garages" className="inline-flex items-center gap-1 hover:text-white">
              <ArrowLeft className="size-3.5" /> All garages
            </Link>
            {g.city && (
              <>
                <ChevronRight className="size-3.5" />
                <Link href={`/garages?q=${encodeURIComponent(g.city)}`} className="hover:text-white">{g.city}</Link>
              </>
            )}
          </nav>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-8">
            <div className="flex min-w-0 items-center gap-5">
              <GarageAvatar name={g.name} logoUrl={g.logoUrl} brandColor={g.brandColor} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#C6F432]/15 px-2.5 py-0.5 text-xs font-semibold text-[#D9F76F]">
                    <BadgeCheck className="size-3.5" /> Runs on FixAm
                  </span>
                </div>
                <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] md:text-5xl">{g.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#AEB5C8]">
                  {location && (
                    <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{location}</span>
                  )}
                  {g.ratingAvg != null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="size-4 fill-[#FFB020] text-[#FFB020]" />
                      <span className="font-semibold text-white">{g.ratingAvg.toFixed(1)}</span>
                      <a href="#reviews" className="hover:text-white">· {g.reviewCount} review{g.reviewCount === 1 ? "" : "s"}</a>
                    </span>
                  ) : (
                    <span>New on FixAm</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Link
                href={g.bookingUrl}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#D4430F] px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_30px_-10px_rgba(255,90,31,0.8)] transition-colors hover:bg-[#B8390A] sm:flex-none"
              >
                <CalendarCheck className="size-4" /> Book online
              </Link>
              {g.phone && (
                <a href={`tel:${g.phone}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-[15px] font-medium transition-colors hover:bg-white/10">
                  <Phone className="size-4" /> Call
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-[15px] font-medium transition-colors hover:bg-white/10">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-12 md:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          {/* Why book */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Smartphone, title: "Live repair tracker", text: "Follow every step from your phone." },
              { icon: Wrench, title: "Approve before work", text: "See findings with photos and prices first." },
              { icon: Wallet, title: "Pay with MoMo", text: "MTN, Telecel, AirtelTigo or card." },
            ].map((f) => (
              <div key={f.title} className="rounded-[18px] border border-border bg-card p-4">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-subtle text-primary"><f.icon className="size-[18px]" /></span>
                <p className="mt-3 text-sm font-semibold">{f.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>

          {/* Services */}
          <section className="rounded-[22px] border border-border bg-card p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Services</h2>
                <p className="mt-1 text-sm text-muted-foreground">Book any of these online and get a live tracker link.</p>
              </div>
              <Link href={g.bookingUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-[#B8390A] hover:text-[#8F2C08]">
                Book a service <ChevronRight className="size-4" />
              </Link>
            </div>
            {g.services.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">General repairs and servicing — call the garage for details.</p>
            ) : (
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {g.services.map((s) => (
                  <li key={s} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground"><Wrench className="size-4" /></span>
                    <span className="text-sm font-medium">{s}</span>
                  </li>
                ))}
              </ul>
            )}

            {g.coverage.length > 0 && (
              <div className="mt-8 border-t border-border-subtle pt-6">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Car className="size-4 text-muted-foreground" /> Vehicles serviced</h3>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {g.coverage.map((c) => (
                    <li key={c} className="rounded-full bg-surface-muted px-3 py-1 text-[13px]">{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Reviews */}
          <section id="reviews" className="scroll-mt-24 rounded-[22px] border border-border bg-card p-6 md:p-8">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Reviews</h2>
            {g.reviews.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No reviews yet. Customers can leave one after their visit.</p>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-center gap-8 rounded-[18px] bg-background p-5">
                  <div>
                    <p className="font-display text-5xl font-semibold tracking-[-0.03em]">{g.ratingAvg?.toFixed(1)}</p>
                    <Stars value={g.ratingAvg ?? 0} />
                    <p className="mt-1 text-xs text-muted-foreground">{g.reviewCount} review{g.reviewCount === 1 ? "" : "s"}</p>
                  </div>
                  <div className="min-w-[220px] flex-1 space-y-1.5">
                    {dist.map((d) => (
                      <div key={d.star} className="flex items-center gap-3 text-xs">
                        <span className="w-3 text-muted-foreground">{d.star}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ECE6DD]">
                          <div className="h-2 rounded-full bg-[#FFB020]" style={{ width: `${g.reviewCount ? (d.count / g.reviewCount) * 100 : 0}%` }} />
                        </div>
                        <span className="w-5 text-right tabular-nums text-muted-foreground">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ul className="mt-6 divide-y divide-border">
                  {g.reviews.map((r, i) => (
                    <li key={i} className="py-5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <Stars value={r.rating} size="size-3.5" />
                        <time className="text-xs text-muted-foreground" dateTime={r.createdAt}>
                          {new Date(`${r.createdAt}T12:00:00`).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                        </time>
                      </div>
                      {r.comment && <p className="mt-2 text-[15px] leading-relaxed">{r.comment}</p>}
                      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <BadgeCheck className="size-3.5 text-[#4E6B07]" /> Verified FixAm customer
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[22px] border border-border bg-card">
            {osmEmbed ? (
              <iframe title={`Map showing ${g.name}`} src={osmEmbed} className="h-48 w-full border-0" loading="lazy" />
            ) : (
              <div className="flex h-32 items-center justify-center bg-[linear-gradient(135deg,#F6EFE6,#FFF4EE)] text-muted-foreground">
                <MapPin className="size-6" />
              </div>
            )}
            <div className="p-5">
              <h2 className="text-[15px] font-semibold">Location</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {[g.address, g.city].filter(Boolean).join(", ") || "Contact the garage for directions."}
              </p>
              {directionsUrl && (
                <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border-strong text-sm font-medium transition-colors hover:bg-surface-sunken">
                  <Navigation className="size-4" /> Get directions
                </a>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-card p-5">
            <h2 className="text-[15px] font-semibold">Contact</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              {g.phone && (
                <li>
                  <a href={`tel:${g.phone}`} className="flex items-center gap-3 hover:text-[#B8390A]">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-surface-muted"><Phone className="size-4" /></span>
                    {g.phone}
                  </a>
                </li>
              )}
              {g.email && (
                <li>
                  <a href={`mailto:${g.email}`} className="flex items-center gap-3 break-all hover:text-[#B8390A]">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted"><Mail className="size-4" /></span>
                    {g.email}
                  </a>
                </li>
              )}
              {!g.phone && !g.email && <li className="text-muted-foreground">Book online to reach this garage.</li>}
            </ul>
          </div>

          {g.branches.length > 1 && (
            <div className="rounded-[22px] border border-border bg-card p-5">
              <h2 className="text-[15px] font-semibold">Branches</h2>
              <ul className="mt-3 divide-y divide-border">
                {g.branches.map((b, i) => (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{b.name}</p>
                    {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                    {b.phone && <a href={`tel:${b.phone}`} className="text-xs text-muted-foreground hover:text-foreground">{b.phone}</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-[22px] bg-[#0B0F1A] p-5 text-[#F4F2EE]">
            <p className="text-[15px] font-semibold">Book in under a minute</p>
            <p className="mt-1 text-sm text-[#AEB5C8]">Pick a service and time. You&apos;ll get a confirmation by SMS.</p>
            <Link href={g.bookingUrl} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#D4430F] text-sm font-semibold text-white hover:bg-[#B8390A]">
              Book online
            </Link>
          </div>
        </aside>
      </div>

      <p className="mx-auto max-w-[1200px] px-6 pb-16 text-center text-[13px] text-muted-foreground md:px-8">
        Own a garage? <Link href="/signup/garage" className="font-semibold text-foreground underline-offset-4 hover:underline">List it on FixAm</Link>
      </p>
    </>
  )
}

export default function GarageProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense
        fallback={
          <>
            <div className="h-[360px] bg-[#0B0F1A]" />
            <div className="mx-auto max-w-[1200px] p-8"><div className="h-96 animate-pulse rounded-[22px] bg-muted" /></div>
          </>
        }
      >
        <ProfileContent params={params} />
      </Suspense>
      <SiteFooter />
    </main>
  )
}
