"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelWorkspaceInviteAction,
  inviteWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  resendWorkspaceInviteAction,
  setWorkspaceMemberStatusAction,
  updateWorkspaceMemberRoleAction,
} from "@/lib/staff/workspace-actions";
import { WORKSPACE_KINDS, type WorkspaceKind } from "@/lib/staff/workspace-shared";
import type { StaffInviteView, StaffMemberView } from "@/lib/staff/workspace-shared";
import { Button } from "@/components/brand/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/brand/card";

type Props = {
  kind: WorkspaceKind;
  workspaceName: string;
  canManage: boolean;
  members: StaffMemberView[];
  invites: StaffInviteView[];
  maxStaff: number | null;
  staffCount: number;
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function WorkspaceStaffPanel({
  kind,
  workspaceName,
  canManage,
  members,
  invites,
  maxStaff,
  staffCount,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    phone: "",
    fullName: "",
    role: WORKSPACE_KINDS[kind].roles[0]?.value ?? "",
  });

  const roles = WORKSPACE_KINDS[kind].roles;
  const ownerRole = WORKSPACE_KINDS[kind].ownerRole;

  function run(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, done?: string) {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(done ?? "Done");
        router.refresh();
      } else {
        setErr(res.error?.message ?? "Something went wrong");
      }
    });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => inviteWorkspaceMemberAction({ kind, ...form }),
      "Invite sent — they'll get an SMS with a link.",
    );
  }

  return (
    <div className="space-y-5">
      {msg && (
        <p className="border-primary/30 bg-primary/10 text-primary rounded-lg border px-3 py-2 text-sm">
          {msg}
        </p>
      )}
      {err && (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
          {err}
        </p>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite staff</CardTitle>
            <CardDescription>
              They get an SMS link, sign in with that phone number, and the workspace appears in
              their switcher.
              {maxStaff != null && ` Your plan allows ${maxStaff} staff (${staffCount} used).`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input
                className={inputCls}
                placeholder="Phone (e.g. 024 000 0000)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
              <input
                className={inputCls}
                placeholder="Full name (optional)"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
              <select
                className={inputCls}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={pending}>
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members</CardTitle>
          <CardDescription>{workspaceName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => {
            const isOwner = m.role === ownerRole;
            return (
              <div
                key={m.memberId}
                className="border-border flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name}
                    {m.isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">{m.phone ?? m.email ?? ""}</p>
                </div>
                {canManage && !m.isSelf ? (
                  <>
                    <select
                      className="border-border bg-background rounded-md border px-2 py-1 text-sm"
                      value={m.role}
                      disabled={pending}
                      onChange={(e) =>
                        run(
                          () =>
                            updateWorkspaceMemberRoleAction({
                              kind,
                              memberId: m.memberId,
                              role: e.target.value,
                            }),
                          "Role updated",
                        )
                      }
                    >
                      {[{ value: ownerRole, label: "Owner" }, ...roles].map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            setWorkspaceMemberStatusAction({
                              kind,
                              memberId: m.memberId,
                              status: m.status === "paused" ? "active" : "paused",
                            }),
                          m.status === "paused" ? "Access restored" : "Access paused",
                        )
                      }
                    >
                      {m.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending || isOwner}
                      title={isOwner ? "Transfer ownership before removing an owner" : undefined}
                      onClick={() => {
                        if (confirm(`Remove ${m.name} from ${workspaceName}?`)) {
                          run(
                            () => removeWorkspaceMemberAction({ kind, memberId: m.memberId }),
                            "Member removed",
                          );
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium">
                    {isOwner ? "Owner" : (roles.find((r) => r.value === m.role)?.label ?? m.role)}
                  </span>
                )}
                {m.status === "paused" && (
                  <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium">
                    Paused
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending invites</CardTitle>
            <CardDescription>Invites expire 7 days after they're sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((i) => (
              <div
                key={i.id}
                className="border-border flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name ?? i.phone}</p>
                  <p className="text-muted-foreground text-xs">
                    {i.phone} · {roleLabel(kind, i.role)} ·{" "}
                    {i.status === "pending"
                      ? `expires ${new Date(i.expiresAt).toLocaleDateString()}`
                      : i.status}
                  </p>
                </div>
                {canManage && i.status === "pending" && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => resendWorkspaceInviteAction({ kind, inviteId: i.id }),
                          "Invite resent",
                        )
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => cancelWorkspaceInviteAction({ kind, inviteId: i.id }),
                          "Invite cancelled",
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function roleLabel(kind: WorkspaceKind, role: string) {
  if (role === WORKSPACE_KINDS[kind].ownerRole) return "Owner";
  return WORKSPACE_KINDS[kind].roles.find((r) => r.value === role)?.label ?? role;
}
