import { connection } from "next/server"
import { adminListTowOperators } from "@/lib/towing/actions"
import { AdminTowPanel } from "./admin-tow-panel"

export async function AdminTowSection() {
  await connection()
  const operators = await adminListTowOperators()
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Tow companies</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pending tow companies can use their dashboard but won&apos;t be matched to SOS calls until approved.
      </p>
      <AdminTowPanel operators={operators} />
    </section>
  )
}
