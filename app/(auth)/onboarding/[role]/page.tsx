import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { portalProfiles } from "@/lib/db/schema"
import { ROLE_OPTIONS, roleBySlug, type RoleSlug } from "../roles"
import { loadOnboarding } from "../load"
import { GarageWizard } from "../garage-wizard"
import { DriverSetup } from "../driver-setup"
import { VendorSetup } from "../vendor-setup"
import { BrokerSetup } from "../broker-setup"
import { TowSetup } from "../tow-setup"

type Params = Promise<{ role: string }>

export function generateStaticParams() {
  return ROLE_OPTIONS.map((r) => ({ role: r.slug }))
}

async function Wizard({ slug }: { slug: RoleSlug }) {
  await connection()
  const ctx = await loadOnboarding(`/signup/${slug}`)
  const has = (t: string) => ctx.workspaces.some((w) => w.type === t)

  switch (slug) {
    case "garage":
      return <GarageWizard defaultPhone={ctx.phone} />
    case "driver": {
      if (ctx.phone) {
        const [profile] = await db().select({ phone: portalProfiles.phone }).from(portalProfiles).where(eq(portalProfiles.phone, ctx.phone)).limit(1)
        if (profile) redirect("/portal")
      }
      return <DriverSetup phone={ctx.phone} defaultName={ctx.name} defaultEmail={ctx.email} />
    }
    case "parts-seller":
      if (has("vendor")) redirect("/vendor")
      return <VendorSetup defaultPhone={ctx.phone} defaultEmail={ctx.email} />
    case "insurance-broker":
    case "dvla-agent":
      if (has("broker")) redirect("/broker")
      return <BrokerSetup defaultKind={slug === "dvla-agent" ? "dvla" : "insurance"} defaultPhone={ctx.phone} defaultEmail={ctx.email} />
    case "tow-operator":
      if (has("tow")) redirect("/tow")
      return <TowSetup defaultPhone={ctx.phone} />
  }
}

/** /onboarding/garage, /onboarding/driver, /onboarding/parts-seller, /onboarding/insurance-broker, /onboarding/dvla-agent */
export default async function OnboardingRolePage({ params }: { params: Params }) {
  const role = roleBySlug((await params).role)
  if (!role) notFound()
  return (
    <Suspense fallback={<main className="h-dvh bg-background" />}>
      <Wizard slug={role.slug} />
    </Suspense>
  )
}
