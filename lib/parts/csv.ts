import { parseGHS } from "@/lib/money"

export type CsvRow = {
  row: number
  sku: string
  name: string
  brand?: string
  category?: string
  unit?: string
  costPrice: number
  sellingPrice: number
  barcode?: string
}
export type CsvIssue = { row: number; sku: string; message: string }

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

const HEADER_MAP: Record<string, keyof CsvRow | "skip"> = {
  sku: "sku", name: "name", brand: "brand", category: "category",
  unit: "unit", "cost price": "costPrice", "selling price": "sellingPrice",
  cost: "costPrice", price: "sellingPrice", barcode: "barcode",
}

export function parsePartsCsv(csvText: string): { rows: CsvRow[]; issues: CsvIssue[] } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { rows: [], issues: [{ row: 0, sku: "", message: "CSV needs a header row and at least one data row" }] }

  const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase())
  const colIndex = new Map<number, keyof CsvRow | "skip">()
  headers.forEach((h, i) => { const k = HEADER_MAP[h]; if (k) colIndex.set(i, k) })
  const keys = [...colIndex.values()]
  if (!keys.includes("sku") || !keys.includes("name")) {
    return { rows: [], issues: [{ row: 1, sku: "", message: "CSV must include sku and name columns" }] }
  }

  const rows: CsvRow[] = []
  const issues: CsvIssue[] = []
  const seen = new Set<string>()
  lines.slice(1).forEach((line, idx) => {
    const rowNum = idx + 2
    const cells = parseCsvLine(line)
    const rec: Partial<CsvRow> = { row: rowNum }
    for (const [i, key] of colIndex) {
      if (key === "skip") continue
      const v = cells[i] ?? ""
      if (key === "costPrice" || key === "sellingPrice") {
        try {
          rec[key] = Number(parseGHS(v)) / 100
        } catch {
          rec[key] = NaN
        }
      } else {
        ;(rec as Record<string, string>)[key] = v
      }
    }
    const sku = (rec.sku ?? "").trim()
    const name = (rec.name ?? "").trim()
    if (!sku || !name) { issues.push({ row: rowNum, sku, message: "sku and name are required" }); return }
    if (seen.has(sku.toLowerCase())) { issues.push({ row: rowNum, sku, message: "duplicate sku in file" }); return }
    seen.add(sku.toLowerCase())
    if (!Number.isFinite(rec.costPrice as number)) { issues.push({ row: rowNum, sku, message: "invalid cost price" }); return }
    if (!Number.isFinite(rec.sellingPrice as number)) { issues.push({ row: rowNum, sku, message: "invalid selling price" }); return }
    rows.push(rec as CsvRow)
  })
  return { rows, issues }
}
