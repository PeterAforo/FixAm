"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { adminFulfillPrivacyRequest } from "@/lib/privacy/actions"

type Req = {
  id: string
  type: string
  status: string
  phone: string | null
  email: string | null
  requestedBy: string
  createdAt: Date | string
  payload: unknown
}

export function AdminPrivacyPanel({ requests }: { requests: Req[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const act = (requestId: string, action: "complete" | "reject") => {
    setMsg(null)
    startTransition(async () => {
      const res = await adminFulfillPrivacyRequest({ requestId, action })
      if (!res.ok) { setMsg(res.error?.message ?? "Failed"); return }
      setMsg(action === "complete" ? "Request completed." : "Request rejected.")
      router.refresh()
    })
  }

  const download = (r: Req) => {
    if (!r.payload) return
    const blob = new Blob([JSON.stringify(r.payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `fixam-export-${r.phone ?? r.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const pendingReqs = requests.filter((r) => r.status === "requested")
  const doneReqs = requests.filter((r) => r.status !== "requested")

  return (
    <div className="mt-4 space-y-4">
      {msg && <p className="rounded-lg border-2 border-border bg-surface px-3 py-2 text-sm font-semibold">{msg}</p>}
      {requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
      {[...pendingReqs, ...doneReqs].map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold capitalize">{r.type} request · {r.phone ?? r.email ?? "unknown"}</p>
              <p className="text-sm text-muted-foreground">
                {r.requestedBy} · {new Date(r.createdAt).toLocaleString()} · {r.status}
              </p>
            </div>
            {r.status === "requested" && (
              <>
                <Button size="sm" disabled={pending} onClick={() => act(r.id, "complete")}>Complete</Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(r.id, "reject")}>Reject</Button>
              </>
            )}
            {r.status === "completed" && r.type === "export" && r.payload != null && (
              <Button size="sm" variant="secondary" onClick={() => download(r)}>Download JSON</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
