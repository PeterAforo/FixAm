import "server-only"
import { desc, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiCalls, garages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export type AiUsageRow = {
  garageId: string | null
  garageName: string | null
  calls: number
  errors: number
  inputTokens: number
  outputTokens: number
  audioSeconds: number
  costMicroUsd: bigint
}

/** Platform-admin AI usage over the last N days, grouped by garage (null = drivers / platform). */
export async function aiUsageByGarage(days = 30): Promise<{ rows: AiUsageRow[]; totals: AiUsageRow }> {
  const since = new Date(Date.now() - days * 86400_000)
  const rows = await db()
    .select({
      garageId: aiCalls.garageId,
      garageName: garages.name,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${aiCalls.status} = 'error')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}),0)::int`,
      audioSeconds: sql<number>`coalesce(sum(${aiCalls.audioSeconds}),0)::float`,
      costMicroUsd: sql<string>`coalesce(sum(${aiCalls.costMicroUsd}),0)::text`,
    })
    .from(aiCalls)
    .leftJoin(garages, eq(garages.id, aiCalls.garageId))
    .where(gte(aiCalls.createdAt, since))
    .groupBy(aiCalls.garageId, garages.name)
    .orderBy(desc(sql`sum(${aiCalls.costMicroUsd})`))
    .limit(50)

  const mapped: AiUsageRow[] = rows.map((r) => ({ ...r, costMicroUsd: BigInt(r.costMicroUsd) }))
  const totals = mapped.reduce<AiUsageRow>(
    (t, r) => ({
      ...t,
      calls: t.calls + r.calls,
      errors: t.errors + r.errors,
      inputTokens: t.inputTokens + r.inputTokens,
      outputTokens: t.outputTokens + r.outputTokens,
      audioSeconds: t.audioSeconds + r.audioSeconds,
      costMicroUsd: t.costMicroUsd + r.costMicroUsd,
    }),
    { garageId: null, garageName: "All", calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0, costMicroUsd: 0n }
  )
  return { rows: mapped, totals }
}

export function formatUsd(micro: bigint): string {
  return `$${(Number(micro) / 1e6).toFixed(Number(micro) < 10_000 ? 4 : 2)}`
}
