/**
 * Money helpers — all amounts are integer pesewas (minor units) as bigint.
 * Display currency is Ghana cedi: "GH₵ 1,250.00" (en-GH / Africa/Accra).
 */

const PESEWAS_PER_CEDI = 100n;

export function toPesewas(cedis: number | bigint | string): bigint {
  const n = typeof cedis === "string" ? cedis : String(cedis)
  if (!/^-?\d+(\.\d{1,2})?$/.test(n.trim())) {
    throw new Error(`Invalid cedi amount: ${cedis}`)
  }
  const negative = n.trim().startsWith("-")
  const [whole, frac = ""] = n.trim().replace("-", "").split(".")
  const pesewas = BigInt(whole) * PESEWAS_PER_CEDI + BigInt((frac + "00").slice(0, 2) || "0")
  return negative ? -pesewas : pesewas
}

export function toCedis(pesewas: bigint | number | string): number {
  const p = BigInt(pesewas)
  const negative = p < 0n
  const abs = negative ? -p : p
  const cedis = Number(abs / PESEWAS_PER_CEDI) + Number(abs % PESEWAS_PER_CEDI) / 100
  return negative ? -cedis : cedis
}

export function formatGHS(pesewas: bigint | number | string, opts?: { sign?: boolean }): string {
  const cedis = toCedis(pesewas)
  const abs = Math.abs(cedis).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const sign = cedis < 0 ? "-" : opts?.sign && cedis > 0 ? "+" : ""
  return `${sign}GH₵ ${abs}`
}

/** Parse display strings like "GH₵ 1,250.50" or "1,250.50" into pesewas. */
export function parseGHS(input: string): bigint {
  const cleaned = input
    .replace(/GH₵/gi, "")
    .replace(/₵/g, "")
    .replace(/[\s,]/g, "")
    .trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Cannot parse amount: ${input}`)
  }
  return toPesewas(cleaned)
}

/** Round pesewas to nearest whole cedi for VAT/tax summaries. */
export function roundToCedi(pesewas: bigint): bigint {
  const negative = pesewas < 0n
  const abs = negative ? -pesewas : pesewas
  const rem = abs % PESEWAS_PER_CEDI
  const rounded = rem >= 50n ? abs - rem + PESEWAS_PER_CEDI : abs - rem
  return negative ? -rounded : rounded
}

/** Sum pesewa amounts safely (avoids bigint->number overflow). */
export function sumPesewas(amounts: Iterable<bigint>): bigint {
  let total = 0n
  for (const a of amounts) total += a
  return total
}
