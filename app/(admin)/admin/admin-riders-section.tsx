import { connection } from "next/server"
import { adminListRiders } from "@/lib/riders/actions"
import { AdminRidersPanel } from "./admin-riders-panel"

export async function AdminRidersSection() {
  await connection()
  const riders = await adminListRiders()
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">FixAm riders</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Approve riders before they can take jobs. To verify a Ghana Card, compare the physical card with the number the rider shows — the app stores it encrypted and only keeps the last 4 digits.
      </p>
      <AdminRidersPanel riders={riders} />
    </section>
  )
}
