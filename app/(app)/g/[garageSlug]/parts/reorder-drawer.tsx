"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { useFocusTrap } from "@/lib/use-focus-trap"
import { formatGHS } from "@/lib/money"
import { suggestVendorsForPart } from "@/lib/reorder/actions"
import { createVendorOrder } from "@/lib/marketplace/actions"

type Suggestion = {
  productId: string; name: string; sku: string; brand: string | null
  price: number; stockStatus: string | null; minOrderQty: number
  leadTimeHours: number | null; vendorId: string; vendorName: string
  rating: number | null; isPreferred: boolean
  zone: { fee?: number; etaHours?: number } | null
}

const inputCls = "min-h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

/** Low-stock part → vendor suggestions → one-tap marketplace order. */
export function ReorderDrawer(props: {
  garageId: string; partId: string; partName: string; branchId: string
  canOrder: boolean; onClose: () => void
}) {
  const { garageId, partId, partName, branchId, canOrder, onClose } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)

  useEffect(() => {
    startTransition(async () => {
      const res = await suggestVendorsForPart({ garageId, partId })
      setLoading(false)
      if (res.ok && res.data) {
        setSuggestions(res.data.suggestions)
        const init: Record<string, number> = {}
        for (const s of res.data.suggestions) init[s.productId] = s.minOrderQty
        setQty(init)
      } else {
        setSuggestions([])
      }
    })
  })

  function order(productId: string) {
    const quantity = qty[productId] ?? 1
    startTransition(async () => {
      const res = await createVendorOrder({
        garageId, branchId,
        items: [{ productId, quantity }],
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(`Ordered: ${res.data.orders.map((o) => o.number).join(", ")} — track under Marketplace → Orders`)
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card ref={panelRef} tabIndex={-1} className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-lg outline-none" onClick={(e) => e.stopPropagation()}>
        <CardContent className="max-h-[80dvh] space-y-3 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Reorder — {partName}</h2>
            <button onClick={onClose} className="text-muted-foreground">✕</button>
          </div>
          {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
          {loading && <p className="text-sm text-muted-foreground">Finding vendors…</p>}
          {!loading && (suggestions ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No vendor products match this part. Map a vendor product to this part (preferred vendor product) or add catalogue items in Marketplace.
            </p>
          )}
          {(suggestions ?? []).map((s) => (
            <div key={s.productId} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.name} {s.isPreferred && <span className="ml-1 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">PREFERRED</span>}</p>
                <p className="text-xs text-muted-foreground">
                  {s.vendorName}{s.rating != null ? ` · ★${s.rating.toFixed(1)}` : ""}
                  {s.zone?.etaHours ? ` · ETA ~${s.zone.etaHours}h` : ""}
                  {s.zone?.fee ? ` · delivery ${formatGHS(s.zone.fee)}` : " · free delivery"}
                </p>
                <p className="text-xs text-muted-foreground">{formatGHS(s.price)} / {s.stockStatus?.replace(/_/g, " ") ?? "—"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input type="number" min={s.minOrderQty} value={qty[s.productId] ?? s.minOrderQty}
                  onChange={(e) => setQty({ ...qty, [s.productId]: Math.max(s.minOrderQty, parseInt(e.target.value || "0", 10)) })}
                  className={`${inputCls} !w-16 text-center`} />
                <Button className="!min-h-9 px-3 text-xs" disabled={pending || !canOrder} onClick={() => order(s.productId)}>Order</Button>
              </div>
            </div>
          ))}
          {!canOrder && <p className="text-xs text-muted-foreground">You don&apos;t have permission to place orders.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
