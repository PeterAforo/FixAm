import { Suspense } from "react"
import { AdminVendorsSection } from "./admin-vendors-section"
import { AdminBrokersSection } from "./admin-brokers-section"
import { AdminDvlaFeesSection } from "./admin-dvla-fees-section"
import { AdminGaragesSection } from "./admin-garages-section"
import { AdminPartnersSection } from "./admin-partners-section"
import { AdminPrivacySection } from "./admin-privacy-section"

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background p-8">
      <h1 className="font-display text-3xl font-bold text-foreground">
        Platform admin
      </h1>
      <Suspense fallback={null}>
        <AdminGaragesSection />
      </Suspense>
      <Suspense fallback={null}>
        <AdminPartnersSection />
      </Suspense>
      <Suspense fallback={null}>
        <AdminPrivacySection />
      </Suspense>
      <Suspense fallback={null}>
        <AdminVendorsSection />
      </Suspense>
      <Suspense fallback={null}>
        <AdminBrokersSection />
      </Suspense>
      <Suspense fallback={null}>
        <AdminDvlaFeesSection />
      </Suspense>
    </main>
  )
}
