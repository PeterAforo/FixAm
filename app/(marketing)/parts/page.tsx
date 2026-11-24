import { Suspense } from "react"
import { connection } from "next/server"
import { findPartsNear } from "@/lib/discovery/finders"
import { nearestAreaLabel, parsePoint, parseRadius } from "@/lib/discovery/near-me"
import { listCatalogueGrouped } from "@/lib/catalogue"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { PageHero } from "@/components/marketing/page-hero"
import { photos } from "@/lib/images"
import { PartsFinder, FinderSkeleton } from "./parts-finder"

type SP = { q?: string; make?: string; model?: string; year?: string; lat?: string; lng?: string; r?: string; verified?: string; delivers?: string; sort?: string }

async function PartsContent({ searchParams }: { searchParams: Promise<SP> }) {
  await connection()
  const sp = await searchParams
  const point = parsePoint(sp.lat, sp.lng)
  const radiusKm = parseRadius(sp.r)
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : undefined

  const [{ sellers, searched }, catalogue] = await Promise.all([
    findPartsNear({
      q: sp.q,
      make: sp.make,
      model: sp.model,
      year,
      point,
      radiusKm,
      verifiedOnly: sp.verified === "1",
      deliversOnly: sp.delivers === "1",
      sort: sp.sort === "cheapest" ? "cheapest" : "nearest",
    }),
    listCatalogueGrouped(),
  ])

  return (
    <PartsFinder
      sellers={sellers}
      searched={searched}
      makes={catalogue.map((m) => ({ name: m.name, models: m.models.map((x) => x.name) }))}
      initial={{
        q: sp.q ?? "", make: sp.make ?? "", model: sp.model ?? "", year: year ? String(year) : "",
        lat: point ? String(point.lat) : "", lng: point ? String(point.lng) : "",
        radius: radiusKm == null ? "all" : String(radiusKm),
        areaLabel: point ? nearestAreaLabel(point) : null,
        verified: sp.verified === "1", delivers: sp.delivers === "1",
        sort: sp.sort === "cheapest" ? "cheapest" : "nearest",
      }}
    />
  )
}

export const metadata = {
  title: "Find car parts near you",
  description: "Search parts that fit your car from verified sellers near you across Ghana. Pay with MoMo — FixAm holds the money until the part arrives.",
}

export default function PartsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PageHero
        image={photos.mechanicEngine}
        active="Find parts"
        eyebrow="For drivers & garages"
        title={
          <>
            The right part, from a seller <span className="bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_60%)] bg-clip-text text-transparent">near you</span>
          </>
        }
        subtitle="Search parts that fit your car from sellers around you. Pay with MoMo — FixAm holds the money until the part arrives."
        className="pb-28 md:pb-32"
      />
      <Suspense fallback={<FinderSkeleton />}>
        <PartsContent searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </main>
  )
}
