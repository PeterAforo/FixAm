import { connection } from "next/server"
import { adminEscrowView } from "@/lib/escrow/actions"
import { AdminEscrowPanel } from "./admin-escrow-panel"

export async function AdminEscrowSection() {
  await connection()
  const view = await adminEscrowView()
  if (!view) return null
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Payments held &amp; payouts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Buyer money FixAm is holding, open disputes, and payouts that need a hand. Every action is recorded in the ledger and audit log.
      </p>
      <AdminEscrowPanel view={view} />
    </section>
  )
}
