const fs = require("fs")
const files = [
  "app/(app)/g/[garageSlug]/credit/[accountId]/credit-account-panel.tsx",
  "app/(app)/g/[garageSlug]/credit/credit-accounts-panel.tsx",
  "app/(app)/g/[garageSlug]/invoices/[invoiceId]/invoice-detail-panel.tsx",
  "app/(app)/g/[garageSlug]/reminders/reminders-panel.tsx",
  "app/(admin)/admin/admin-garages-panel.tsx",
  "components/shell/command-palette.tsx",
  "components/brand/celebration.tsx",
  "app/(app)/g/[garageSlug]/parts/parts-panel.tsx",
  "app/(app)/g/[garageSlug]/purchase-orders/po-panel.tsx",
  "app/(app)/g/[garageSlug]/parts/reorder-drawer.tsx",
  "app/(app)/g/[garageSlug]/invoices/invoices-panel.tsx",
]
const INJECT = "max-h-[calc(100dvh-2rem)] overflow-y-auto"
let total = 0
for (const f of files) {
  let s = fs.readFileSync(f, "utf8")
  // also modernize vh-based max-h
  s = s.replace(/max-h-\[90vh\]/g, "max-h-[90dvh]")
  const overlayRe = /<div className="fixed inset-0[^"]*"[^>]*>/g
  let out = "",
    last = 0,
    count = 0,
    m
  while ((m = overlayRe.exec(s))) {
    const tag = m[0]
    // only centered/bottom-anchored modals (skip pure backdrops & side drawers)
    if (!/items-(center|end|start)/.test(tag)) continue
    const rest = s.slice(m.index + tag.length, m.index + tag.length + 600)
    // find first inner element opening tag with a className
    const inner = rest.match(/<(?:div|Card|section|form)\b[^>]*className="[^"]*"[^>]*>/)
    if (!inner) continue
    const innerTag = inner[0]
    const cls = innerTag.match(/className="([^"]*)"/)[1]
    if (/max-h-|overflow-y-auto|overflow-auto/.test(cls)) continue
    const patched = innerTag.replace(
      /className="([^"]*)"/,
      `className="${INJECT} $1"`
    )
    const at = m.index + tag.length + inner.index
    out += s.slice(last, at) + patched
    last = at + innerTag.length
    count++
  }
  out += s.slice(last)
  if (count) {
    fs.writeFileSync(f, out)
    total += count
    console.log(`${count} patched: ${f}`)
  } else if (s !== fs.readFileSync(f, "utf8")) {
    fs.writeFileSync(f, s)
  }
}
console.log(`TOTAL ${total}`)
