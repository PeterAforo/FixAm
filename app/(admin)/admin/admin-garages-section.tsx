import { connection } from "next/server"
import { adminListGarages } from "@/lib/admin/actions"
import { AdminGaragesPanel } from "./admin-garages-panel"

/** Garages table. The admin layout has already checked platform admin. */
export async function AdminGaragesSection({ compact = false }: { compact?: boolean }) {
  await connection()
  const garages = await adminListGarages()
  return <AdminGaragesPanel garages={garages.ok ? garages.data : []} compact={compact} />
}
