import { connection } from "next/server"
import { adminEscrowView } from "@/lib/escrow/actions"
import { AdminEscrowPanel } from "./admin-escrow-panel"

export async function AdminEscrowSection() {
  await connection()
  const view = await adminEscrowView()
  if (!view) return null
  return (
    <section className="mt-6">
      <AdminEscrowPanel view={view} />
    </section>
  )
}
