import { connection } from "next/server"
import { adminFreeGaragePlaces, adminListGarages } from "@/lib/admin/actions"
import { AdminGaragesPanel } from "./admin-garages-panel"

/** Garages table. The admin layout has already checked platform admin. */
export async function AdminGaragesSection({ compact = false }: { compact?: boolean }) {
  await connection()
  const [garages, places] = await Promise.all([adminListGarages(), adminFreeGaragePlaces()])
  return (
    <AdminGaragesPanel
      garages={garages.ok ? garages.data : []}
      compact={compact}
      freePlaces={places.ok ? places.data : null}
    />
  )
}
