import { Suspense } from "react"
import { connection } from "next/server"
import { findBrokersNear, type BrokerKindFilter } from "@/lib/discovery/finders"
import { nearestAreaLabel, parsePoint, parseRadius } from "@/lib/discovery/near-me"
import { INSURERS } from "@/lib/brokers/catalog"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { PageHero } from "@/components/marketing/page-hero"
import { photos } from "@/lib/images"
import { FinderSkeleton } from "../parts/parts-finder"
import { BrokersFinder } from "./brokers-finder"

type SP = { kind?: string; lat?: string; lng?: string; r?: string; verified?: string; insurer?: string }

async function BrokersContent({ searchParams }: { searchParams: Promise<SP> }) {
  await connection()
  const sp = await searchParams
  const kind: BrokerKindFilter = sp.kind === "dvla" ? "dvla" : sp.kind === "all" ? "all" : "insurance"
  const point = parsePoint(sp.lat, sp.lng)
  const radiusKm = parseRadius(sp.r)
  const insurer = sp.insurer && (INSURERS as readonly string[]).includes(sp.insurer) ? sp.insurer : ""
  const { near, unpinned } = await findBrokersNear({ kind, point, radiusKm, verifiedOnly: sp.verified === "1", insurer: insurer || undefined })

  return (
    <BrokersFinder
      near={near}
      unpinned={unpinned}
      insurers={[...INSURERS]}
      initial={{
        kind,
        lat: point ? String(point.lat) : "", lng: point ? String(point.lng) : "",
        radius: radiusKm == null ? "all" : String(radiusKm),
        areaLabel: point ? nearestAreaLabel(point) : null,
        verified: sp.verified === "1",
        insurer,
      }}
    />
  )
}

export const metadata = {
  title: "Find an insurance broker or DVLA agent near you",
  description: "Compare licensed motor insurance brokers and DVLA agents near you in Ghana, ask several for quotes in one go, and pay with MoMo.",
}

export default function BrokersPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PageHero
        image={photos.insuranceOffice}
        active="Insurance & DVLA"
        eyebrow="Renew without the queue"
        title={
          <>
            Insurance and DVLA renewals, <span className="bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_60%)] bg-clip-text text-transparent">near you</span>
          </>
        }
        subtitle="Compare licensed brokers and DVLA agents around you, ask several for quotes in one go, and pay with MoMo."
        className="pb-28 md:pb-32"
      />
      <Suspense fallback={<FinderSkeleton />}>
        <BrokersContent searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </main>
  )
}
