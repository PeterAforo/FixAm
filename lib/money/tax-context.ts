import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageSettings } from "@/lib/db/schema"
import type { TaxRule } from "@/lib/domain/tax"

type TaxRuleJson = {
  code: string
  name?: string
  rate_bp: number
  applies_to: string[]
  compound: boolean
  enabled: boolean
}

/** Garage tax rules + pricesIncludeTax flag, normalised for computeTaxTotals. */
export async function garageTaxContext(garageId: string): Promise<{ rules: TaxRule[]; pricesIncludeTax: boolean }> {
  const [s] = await db()
    .select({ taxRules: garageSettings.taxRules, pricesIncludeTax: garageSettings.pricesIncludeTax })
    .from(garageSettings)
    .where(eq(garageSettings.garageId, garageId))
    .limit(1)
  const rules = ((s?.taxRules as TaxRuleJson[] | null) ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    rate_bp: Number(r.rate_bp),
    applies_to: r.applies_to ?? [],
    compound: !!r.compound,
    enabled: r.enabled !== false,
  })) as TaxRule[]
  return { rules, pricesIncludeTax: !!s?.pricesIncludeTax }
}
