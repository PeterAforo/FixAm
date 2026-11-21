import { Suspense } from "react"
import { AdminVendorsSection } from "./admin-vendors-section"
import { AdminDvlaFeesSection } from "./admin-dvla-fees-section"

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background p-8">
      <h1 className="font-display text-3xl font-bold text-foreground">
        Platform admin
      </h1>
      <p className="mt-2 text-muted-foreground">Builds out fully in P5-02.</p>
      <Suspense fallback={null}>
        <AdminVendorsSection />
      </Suspense>
      <Suspense fallback={null}>
        <AdminDvlaFeesSection />
      </Suspense>
    </main>
  )
}
