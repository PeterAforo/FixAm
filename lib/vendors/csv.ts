import { parseGHS } from "@/lib/money"

export type VendorCsvRow = {
  row: number
  sku: string
  name: string
  brand?: string
  category: string
  unit?: string
  price: number // cedis
  stockStatus?: string
  quantityAvailable?: number
  minOrderQty?: number
  leadTimeHours?: number
  partType?: string
  condition?: string
  fitMake?: string
  fitModel?: string
  fitYearFrom?: number
  fitYearTo?: number
  oemNumber?: string
  warrantyDays?: number
}
export type VendorCsvIssue = { row: number; sku: string; message: string }

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = "", inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const HEADER_MAP: Record<string, keyof VendorCsvRow | "skip"> = {
  sku: "sku", name: "name", brand: "brand", category: "category",
  unit: "unit", price: "price", "stock status": "stockStatus",
  "quantity available": "quantityAvailable", "min order qty": "minOrderQty",
  "lead time hours": "leadTimeHours",
  "part type": "partType", condition: "condition",
  "fits make": "fitMake", make: "fitMake", "fits model": "fitModel", model: "fitModel",
  "year from": "fitYearFrom", "year to": "fitYearTo",
  "oem number": "oemNumber", oem: "oemNumber", "warranty days": "warrantyDays",
}

const INT_KEYS = new Set(["quantityAvailable", "minOrderQty", "leadTimeHours", "fitYearFrom", "fitYearTo", "warrantyDays"])
const CONDITIONS: Record<string, string> = {
  genuine: "genuine", oem: "genuine", original: "genuine",
  aftermarket: "aftermarket", new: "aftermarket",
  home_used: "home_used", "home used": "home_used", used: "home_used", "tokunbo": "home_used",
}

const STOCK_STATUSES = new Set(["in_stock", "low", "out", "on_order"])

export function parseVendorProductsCsv(csvText: string): { rows: VendorCsvRow[]; issues: VendorCsvIssue[] } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { rows: [], issues: [{ row: 0, sku: "", message: "CSV needs a header row and at least one data row" }] }

  const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase())
  const colIndex = new Map<number, keyof VendorCsvRow | "skip">()
  headers.forEach((h, i) => { const k = HEADER_MAP[h]; if (k) colIndex.set(i, k) })
  const keys = [...colIndex.values()]
  if (!keys.includes("sku") || !keys.includes("name") || !keys.includes("category") || !keys.includes("price")) {
    return { rows: [], issues: [{ row: 1, sku: "", message: "CSV must include sku, name, category and price columns" }] }
  }

  const rows: VendorCsvRow[] = []
  const issues: VendorCsvIssue[] = []
  const seen = new Set<string>()
  lines.slice(1).forEach((line, idx) => {
    const rowNum = idx + 2
    const cells = parseCsvLine(line)
    const rec: Partial<VendorCsvRow> = { row: rowNum }
    for (const [i, key] of colIndex) {
      if (key === "skip") continue
      const v = cells[i] ?? ""
      if (key === "price") {
        try { rec.price = Number(parseGHS(v)) / 100 } catch { rec.price = NaN }
      } else if (INT_KEYS.has(key)) {
        const n = v === "" ? undefined : parseInt(v, 10)
        ;(rec as Record<string, number | undefined>)[key] = n !== undefined && Number.isFinite(n) ? n : undefined
      } else if (key === "condition") {
        rec.condition = v ? (CONDITIONS[v.toLowerCase()] ?? "__invalid__") : undefined
      } else {
        ;(rec as Record<string, string>)[key] = v
      }
    }
    const sku = (rec.sku ?? "").trim()
    const name = (rec.name ?? "").trim()
    const category = (rec.category ?? "").trim()
    if (!sku || !name || !category) { issues.push({ row: rowNum, sku, message: "sku, name and category are required" }); return }
    if (seen.has(sku.toLowerCase())) { issues.push({ row: rowNum, sku, message: "duplicate sku in file" }); return }
    seen.add(sku.toLowerCase())
    if (!Number.isFinite(rec.price as number) || (rec.price as number) < 0) { issues.push({ row: rowNum, sku, message: "invalid price" }); return }
    if (rec.condition === "__invalid__") { issues.push({ row: rowNum, sku, message: "condition must be genuine, aftermarket or home used" }); return }
    if (rec.stockStatus && !STOCK_STATUSES.has(rec.stockStatus)) { issues.push({ row: rowNum, sku, message: `invalid stock status "${rec.stockStatus}"` }); return }
    rows.push(rec as VendorCsvRow)
  })
  return { rows, issues }
}
