"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/brand/button"
import { adminUpsertPartType, type PartTypeView } from "@/lib/parts-catalog/actions"

const inputCls =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

type Draft = { id?: string; name: string; category: string; synonyms: string; hours: string }

export function AdminPartsPanel({ parts }: { parts: PartTypeView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const categories = useMemo(() => [...new Set(parts.map((p) => p.category))], [parts])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return parts
    return parts.filter((p) => p.name.toLowerCase().includes(t) || p.synonyms.some((s) => s.toLowerCase().includes(t)) || p.category.toLowerCase().includes(t))
  }, [parts, q])

  function save() {
    if (!draft) return
    setMsg(null)
    start(async () => {
      const res = await adminUpsertPartType({
        id: draft.id,
        name: draft.name,
        category: draft.category,
        synonyms: draft.synonyms.split(",").map((s) => s.trim()).filter(Boolean),
        typicalLabourHours: draft.hours ? Number(draft.hours) : null,
      })
      if (!res.ok) return setMsg(res.error.message)
      setDraft(null)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputCls} pl-9`} placeholder={`Search ${parts.length} parts or names…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={() => setDraft({ name: "", category: categories[0] ?? "Engine", synonyms: "", hours: "" })}>
          <Plus className="size-4" /> Add part
        </Button>
      </div>

      {draft && (
        <div className="grid gap-3 rounded-[18px] border border-border bg-card p-4 sm:grid-cols-[2fr_1.2fr_3fr_0.8fr_auto] sm:items-end">
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Name</span>
            <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Category</span>
            <input list="part-cats" className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <datalist id="part-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Other names (comma-separated, any language)</span>
            <input className={inputCls} value={draft.synonyms} onChange={(e) => setDraft({ ...draft, synonyms: e.target.value })} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Labour hrs</span>
            <input className={inputCls} inputMode="decimal" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} /></label>
          <div className="flex gap-2">
            <Button onClick={save} loading={pending} disabled={draft.name.trim().length < 2}>Save</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
          {msg && <p className="text-sm text-[#B3122F] sm:col-span-5">{msg}</p>}
        </div>
      )}

      <div className="max-h-[520px] overflow-auto rounded-[18px] border border-border bg-card">
        <table className="table-cards w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-left text-xs font-medium text-muted-foreground">
            <tr><th className="px-4 py-2.5">Part</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Other names</th><th className="px-4 py-2.5" /></tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.category}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.synonyms.join(", ") || "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    className="text-xs font-semibold text-[#B8390A] hover:underline"
                    onClick={() => setDraft({ id: p.id, name: p.name, category: p.category, synonyms: p.synonyms.join(", "), hours: p.typicalLabourHours?.toString() ?? "" })}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
