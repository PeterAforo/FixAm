/**
 * Shared (client-safe) constants and types for the workspace staff system.
 * Server logic lives in lib/staff/workspace.ts; client-callable actions in
 * lib/staff/workspace-actions.ts.
 */

export type WorkspaceKind = "vendor" | "broker" | "tow";

export const WORKSPACE_KINDS: Record<
  WorkspaceKind,
  {
    label: string;
    /** Roles an invite can grant — the owner role is never invitable (transfer only). */
    roles: { value: string; label: string }[];
    ownerRole: string;
    basePath: string;
  }
> = {
  vendor: {
    label: "Parts shop",
    roles: [
      { value: "vendor_manager", label: "Manager" },
      { value: "vendor_sales", label: "Counter / sales" },
      { value: "vendor_dispatcher", label: "Dispatcher" },
    ],
    ownerRole: "vendor_owner",
    basePath: "/vendor",
  },
  broker: {
    label: "Broker / DVLA agent",
    roles: [
      { value: "agent", label: "Agent" },
      { value: "accounts", label: "Accounts" },
    ],
    ownerRole: "owner",
    basePath: "/broker",
  },
  tow: {
    label: "Tow company",
    roles: [
      { value: "dispatcher", label: "Dispatcher" },
      { value: "driver", label: "Tow driver" },
    ],
    ownerRole: "owner",
    basePath: "/tow",
  },
};

export function isWorkspaceKind(v: string): v is WorkspaceKind {
  return v === "vendor" || v === "broker" || v === "tow";
}

export function workspaceRoleLabel(kind: WorkspaceKind, role: string) {
  if (role === WORKSPACE_KINDS[kind].ownerRole) return "Owner";
  return WORKSPACE_KINDS[kind].roles.find((r) => r.value === role)?.label ?? role;
}

export type StaffMemberView = {
  memberId: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  status: string;
  isSelf: boolean;
};

export type StaffInviteView = {
  id: string;
  name: string | null;
  phone: string | null;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};
