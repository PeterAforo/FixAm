import { Suspense } from "react"
import { AdminVendorsSection } from "../admin-vendors-section"
import { AdminBrokersSection } from "../admin-brokers-section"
import { AdminRidersSection } from "../admin-riders-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Approvals · Admin" }

export default function AdminApprovalsPage() {
  return (
    <>
      <AdminPageHeader title="Approvals" description="Parts sellers, brokers, DVLA agents and riders waiting for a check before they go live." />
      <div id="vendors" className="scroll-mt-6">
        <Suspense fallback={null}><AdminVendorsSection /></Suspense>
      </div>
      <div id="brokers" className="scroll-mt-6">
        <Suspense fallback={null}><AdminBrokersSection /></Suspense>
      </div>
      <div id="riders" className="scroll-mt-6">
        <Suspense fallback={null}><AdminRidersSection /></Suspense>
      </div>
    </>
  )
}
