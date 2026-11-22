"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/brand/button"
import { addGarageCoverage, removeGarageCoverage } from "@/lib/discovery/coverage-actions"

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

type CoverageRow = {
  id: string
  make: string
  model: string | null
  notes: string | null
  catalogMakeId: string | null
  catalogModelId: string | null
}

type Make = { id: string; name: string; models: { id: string; name: string }[] }

export function CoveragePanel({
  garageId,
  coverage,
  makes,
}: {
  garageId: string
  coverage: CoverageRow[]
  makes: Make[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [makeId, setMakeId] = useState("")
  const [modelId, setModelId] = useState("")
  const [customMake, setCustomMake] = useState("")
  const [customModel, setCustomModel] = useState("")
  const [mode, setMode] = useState<"catalogue" | "custom">("catalogue")
  const [msg, setMsg] = useState<string | null>(null)

  const selectedMake = makes.find((m) => m.id === makeId)
  const useCatalogue = mode === "catalogue"

  function add() {
    setMsg(null)
    startTransition(async () => {
      const res = await addGarageCoverage({
        garageId,
        catalogMakeId: useCatalogue ? makeId : null,
        catalogModelId: useCatalogue && modelId ? modelId : null,
        make: useCatalogue ? "" : customMake,
        model: useCatalogue ? "" : customModel,
      })
      if (!res.ok) {
        setMsg(res.error.message)
        return
      }
      setMakeId("")
      setModelId("")
      setCustomMake("")
      setCustomModel("")
      router.refresh()
    })
  }

  function remove(id: string) {
    setMsg(null)
    startTransition(async () => {
      const res = await removeGarageCoverage({ garageId, coverageId: id })
      if (!res.ok) {
        setMsg(res.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Declare which makes and models your garage services. This powers the public directory —
        customers searching for a garage for their car will find you here.
      </p>

      {coverage.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {coverage.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-semibold">
                  {c.make}
                  {c.model ? ` ${c.model}` : " — all models"}
                </p>
                {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove(c.id)} aria-label={`Remove ${c.make}`}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        {useCatalogue ? (
          <>
            <select className={inputCls} value={makeId} onChange={(e) => { setMakeId(e.target.value); setModelId("") }}>
              <option value="">Pick make…</option>
              {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className={inputCls} value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!selectedMake}>
              <option value="">All models</option>
              {selectedMake?.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>
        ) : (
          <>
            <input className={inputCls} placeholder="Make (e.g. Toyota)" value={customMake} onChange={(e) => setCustomMake(e.target.value)} />
            <input className={inputCls} placeholder="Model (optional)" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
          </>
        )}
        <Button type="button" onClick={add} disabled={pending || (!useCatalogue && !customMake.trim())}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <button
        type="button"
        className="mt-2 text-xs font-semibold text-primary underline"
        onClick={() => {
          setMode(useCatalogue ? "custom" : "catalogue")
          setMakeId("")
          setModelId("")
          setCustomMake("")
          setCustomModel("")
        }}
      >
        {useCatalogue ? "Enter a custom make instead" : "Pick from the catalogue instead"}
      </button>
      {msg && <p className="mt-2 text-sm font-semibold text-danger">{msg}</p>}
    </div>
  )
}
