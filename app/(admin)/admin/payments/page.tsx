import { Suspense } from "react"
import { AdminEscrowSection } from "../admin-escrow-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Payments · Admin" }

export default function AdminPaymentsPage() {
  return (
    <>
      <AdminPageHeader title="Payments & payouts" description="Buyer money FixAm is holding, open disputes, and payouts that need a hand. Every action is recorded in the ledger and audit log." />
      <Suspense fallback={null}><AdminEscrowSection /></Suspense>
    </>
  )
}
