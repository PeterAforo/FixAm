"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { adminUpsertInsurancePartner } from "@/lib/admin/actions"

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Partner = {
  id: string
  name: string
  nicLicenceNumber: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  isActive: boolean | null
}

const EMPTY = { partnerId: "", name: "", nicLicenceNumber: "", contactName: "", contactPhone: "", contactEmail: "" }

export function AdminPartnersPanel({ partners }: { partners: Partner[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState(EMPTY)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await adminUpsertInsurancePartner({
        partnerId: form.partnerId || undefined,
        name: form.name,
        nicLicenceNumber: form.nicLicenceNumber || undefined,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        isActive: true,
      })
      if (!res.ok) { setMsg({ ok: false, text: res.error?.message ?? "Save failed" }); return }
      setMsg({ ok: true, text: "Partner saved." })
      setForm(EMPTY)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <Card><CardContent className="p-5">
        <h3 className="font-display text-base font-bold">{form.partnerId ? "Edit partner" : "Add partner"}</h3>
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={inputCls} placeholder="Name *" required value={form.name} onChange={set("name")} />
          <input className={inputCls} placeholder="NIC licence no." value={form.nicLicenceNumber} onChange={set("nicLicenceNumber")} />
          <input className={inputCls} placeholder="Contact name" value={form.contactName} onChange={set("contactName")} />
          <input className={inputCls} placeholder="Contact phone" value={form.contactPhone} onChange={set("contactPhone")} />
          <input className={inputCls} placeholder="Contact email" value={form.contactEmail} onChange={set("contactEmail")} />
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={pending}>{form.partnerId ? "Save" : "Add"}</Button>
            {form.partnerId && <Button type="button" variant="secondary" onClick={() => setForm(EMPTY)}>Cancel</Button>}
            {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
          </div>
        </form>
      </CardContent></Card>
      <div className="space-y-2">
        {partners.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{p.name}{p.isActive === false ? " (inactive)" : ""}</p>
                <p className="truncate text-sm text-muted-foreground">{[p.nicLicenceNumber, p.contactPhone, p.contactEmail].filter(Boolean).join(" · ") || "No contact details"}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setForm({ partnerId: p.id, name: p.name, nicLicenceNumber: p.nicLicenceNumber ?? "", contactName: p.contactName ?? "", contactPhone: p.contactPhone ?? "", contactEmail: p.contactEmail ?? "" })}>Edit</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
