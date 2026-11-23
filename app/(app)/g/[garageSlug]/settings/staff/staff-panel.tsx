"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { inviteStaff, setMemberStatus, updateMemberRole } from "@/lib/staff/actions"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { Plus } from "lucide-react"

type StaffRow = {
  id: string
  role: string
  status: string
  invitedPhone: string | null
  invitedEmail: string | null
  branchId: string | null
  branchName: string | null
  userId: string | null
  fullName: string | null
  email: string | null
  phone: string | null
}

const ROLES = [
  "manager",
  "service_advisor",
  "mechanic",
  "storekeeper",
  "accountant",
  "garage_driver",
  "inspector",
] as const

const inputCls =
  "min-h-11 rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function StaffPanel({
  garageId,
  staff,
  branches,
  currentUserId,
}: {
  garageId: string
  staff: StaffRow[]
  branches: { id: string; name: string }[]
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<string>("mechanic")
  const [branchId, setBranchId] = useState<string>("")

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3000)
  }

  function doInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await inviteStaff({ garageId, phone, role, branchId: branchId || null })
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      setPhone("")
      flash("Invite sent")
      router.refresh()
    })
  }

  function doRoleChange(m: StaffRow, newRole: string) {
    setError(null)
    startTransition(async () => {
      const res = await updateMemberRole({ garageId, membershipId: m.id, role: newRole })
      if (!res.ok) setError(res.error.message)
      router.refresh()
    })
  }

  function doStatus(m: StaffRow, status: "active" | "suspended") {
    setError(null)
    startTransition(async () => {
      const res = await setMemberStatus({ garageId, membershipId: m.id, status })
      if (!res.ok) setError(res.error.message)
      else flash(status === "suspended" ? "Member suspended" : "Member reactivated")
      router.refresh()
    })
  }

  const name = (m: StaffRow) =>
    m.fullName ?? m.invitedPhone ?? m.invitedEmail ?? m.email ?? "Unknown"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite staff</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={doInvite} className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Phone
              </span>
              <input
                className={`${inputCls} w-full font-mono`}
                inputMode="tel"
                placeholder="0241234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Role
              </span>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Branch
              </span>
              <select
                className={inputCls}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending}>
              <Plus className="size-4" /> Invite
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-3 rounded-lg border border-success bg-success/10 px-3 py-2 text-sm font-semibold text-success">
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {staff.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{name(m)}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.email ?? m.phone ?? m.invitedEmail ?? m.invitedPhone ?? ""}
                    {m.branchName ? ` · ${m.branchName}` : " · all branches"}
                  </p>
                </div>
                <StatusPill
                  tone={m.status === "active" ? "ok" : m.status === "invited" ? "info" : "danger"}
                >
                  {m.status}
                </StatusPill>
                {m.role !== "owner" && m.userId !== currentUserId && (
                  <>
                    <select
                      className={inputCls}
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => doRoleChange(m, e.target.value)}
                      aria-label={`Role for ${name(m)}`}
                    >
                      {["owner", ...ROLES].map((r) => (
                        <option key={r} value={r} disabled={r === "owner"}>
                          {r.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    {m.status === "active" ? (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => doStatus(m, "suspended")}
                      >
                        Suspend
                      </Button>
                    ) : m.status === "suspended" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => doStatus(m, "active")}
                      >
                        Reactivate
                      </Button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
