import { connection } from "next/server"
import { adminListBrokers } from "@/lib/brokers/actions"
import { AdminBrokersPanel } from "./admin-brokers-panel"

export async function AdminBrokersSection() {
  await connection()
  const brokers = await adminListBrokers()
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Insurance brokers &amp; DVLA agents</h2>
      <p className="mt-1 text-sm text-muted-foreground">Verify licence numbers to give brokers the Verified badge. Suspended brokers disappear from driver and garage pickers.</p>
      <AdminBrokersPanel brokers={brokers} />
    </section>
  )
}
