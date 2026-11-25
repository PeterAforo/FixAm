"use client"

import { useEffect } from "react"

/**
 * Phones show `table.table-cards` rows as stacked cards (see globals.css).
 * Each cell needs its column name to make sense out of the grid, so this
 * copies the header text onto every body cell as `data-label`, and keeps
 * doing it as tables re-render. Mounted once in the root layout.
 */
function labelTables(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>("table.table-cards").forEach((table) => {
    const heads = Array.from(table.tHead?.rows[0]?.cells ?? []).map((c) => ({
      text: (c.textContent ?? "").trim(),
      span: c.colSpan || 1,
    }))
    if (heads.length === 0) return
    const labels: string[] = []
    for (const h of heads) for (let i = 0; i < h.span; i++) labels.push(h.text)
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        let col = 0
        for (const cell of Array.from(row.cells)) {
          const label = cell.colSpan > 1 ? "" : labels[col] ?? ""
          if (cell.dataset.label !== label) cell.dataset.label = label
          col += cell.colSpan || 1
        }
      }
    }
  })
}

export function TableCardLabels() {
  useEffect(() => {
    labelTables(document)
    let queued = false
    const observer = new MutationObserver(() => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        labelTables(document)
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return null
}
