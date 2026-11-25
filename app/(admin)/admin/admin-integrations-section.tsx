import { connection } from "next/server"
import { adminListIntegrations } from "@/lib/admin/integration-actions"
import { AdminIntegrationsPanel } from "./admin-integrations-panel"

/** The admin layout has already checked platform admin; the action checks again. */
export async function AdminIntegrationsSection() {
  await connection()
  const res = await adminListIntegrations()
  if (!res.ok) return null
  return <AdminIntegrationsPanel items={res.data.items} env={res.data.env} />
}
