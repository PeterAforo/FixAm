import "server-only";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brokerMembers,
  brokers,
  towOperatorMembers,
  towOperators,
  users,
  vendorMembers,
  vendors,
  workspaceInvites,
} from "@/lib/db/schema";
import { writeAuditLog, type ActionError, type ActionResult } from "@/lib/actions";
import { getSessionUserId } from "@/lib/auth/ensure-user";
import { normalizeGhPhone } from "@/lib/phone";
import { sendDirectSms, appUrl } from "@/lib/messaging/direct";
import { accountBilling, accountWriteBlockReason } from "@/lib/billing/account";
import {
  WORKSPACE_KINDS,
  isWorkspaceKind,
  workspaceRoleLabel as roleLabel,
  type StaffInviteView,
  type StaffMemberView,
  type WorkspaceKind,
} from "./workspace-shared";

export { WORKSPACE_KINDS, isWorkspaceKind };
export type { StaffInviteView, StaffMemberView, WorkspaceKind };

/**
 * Shared staff & invites for non-garage workspaces (vendor, broker, tow).
 * One invites table (workspace_invites), one Staff screen, per-kind role
 * vocabularies in workspace-shared.ts. Garages keep the memberships-based
 * flow in lib/staff/actions.ts.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function newInviteToken() {
  return randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Membership resolution (returns member row id + role + workspace)
// ---------------------------------------------------------------------------

type Ctx = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  memberId: string;
};

async function myMembership(kind: WorkspaceKind, userId: string): Promise<Ctx | null> {
  if (kind === "vendor") {
    const [r] = await db()
      .select({
        memberId: vendorMembers.id,
        role: vendorMembers.role,
        wsId: vendors.id,
        name: vendors.businessName,
      })
      .from(vendorMembers)
      .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
      .where(
        and(
          eq(vendorMembers.userId, userId),
          eq(vendorMembers.status, "active"),
          isNull(vendors.deletedAt),
        ),
      )
      .limit(1);
    return r
      ? { userId, workspaceId: r.wsId, workspaceName: r.name, role: r.role, memberId: r.memberId }
      : null;
  }
  if (kind === "broker") {
    const [r] = await db()
      .select({
        memberId: brokerMembers.id,
        role: brokerMembers.role,
        wsId: brokers.id,
        name: brokers.businessName,
      })
      .from(brokerMembers)
      .innerJoin(brokers, eq(brokerMembers.brokerId, brokers.id))
      .where(
        and(
          eq(brokerMembers.userId, userId),
          eq(brokerMembers.status, "active"),
          isNull(brokers.deletedAt),
        ),
      )
      .limit(1);
    return r
      ? { userId, workspaceId: r.wsId, workspaceName: r.name, role: r.role, memberId: r.memberId }
      : null;
  }
  const [r] = await db()
    .select({
      memberId: towOperatorMembers.id,
      role: towOperatorMembers.role,
      wsId: towOperators.id,
      name: towOperators.businessName,
    })
    .from(towOperatorMembers)
    .innerJoin(towOperators, eq(towOperatorMembers.operatorId, towOperators.id))
    .where(
      and(
        eq(towOperatorMembers.userId, userId),
        eq(towOperatorMembers.status, "active"),
        isNull(towOperators.deletedAt),
      ),
    )
    .limit(1);
  return r
    ? { userId, workspaceId: r.wsId, workspaceName: r.name, role: r.role, memberId: r.memberId }
    : null;
}

function isOwner(kind: WorkspaceKind, role: string) {
  return role === WORKSPACE_KINDS[kind].ownerRole;
}

async function requireOwner(
  kind: WorkspaceKind,
): Promise<{ ok: true; ctx: Ctx } | { ok: false; error: ActionError }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const ctx = await myMembership(kind, userId);
  if (!ctx) return { ok: false, error: { code: "NOT_FOUND", message: "Workspace not found" } };
  if (!isOwner(kind, ctx.role)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only the owner can manage staff" } };
  }
  return { ok: true, ctx };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getWorkspaceStaff(kind: WorkspaceKind): Promise<{
  workspaceName: string;
  role: string;
  canManage: boolean;
  members: StaffMemberView[];
  invites: StaffInviteView[];
  maxStaff: number | null;
  staffCount: number;
} | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const ctx = await myMembership(kind, userId);
  if (!ctx) return null;

  const memberRows =
    kind === "vendor"
      ? await db()
          .select({
            memberId: vendorMembers.id,
            userId: vendorMembers.userId,
            role: vendorMembers.role,
            status: vendorMembers.status,
            name: users.fullName,
            phone: users.phone,
            email: users.email,
          })
          .from(vendorMembers)
          .innerJoin(users, eq(vendorMembers.userId, users.id))
          .where(eq(vendorMembers.vendorId, ctx.workspaceId))
      : kind === "broker"
        ? await db()
            .select({
              memberId: brokerMembers.id,
              userId: brokerMembers.userId,
              role: brokerMembers.role,
              status: brokerMembers.status,
              name: users.fullName,
              phone: users.phone,
              email: users.email,
            })
            .from(brokerMembers)
            .innerJoin(users, eq(brokerMembers.userId, users.id))
            .where(eq(brokerMembers.brokerId, ctx.workspaceId))
        : await db()
            .select({
              memberId: towOperatorMembers.id,
              userId: towOperatorMembers.userId,
              role: towOperatorMembers.role,
              status: towOperatorMembers.status,
              name: users.fullName,
              phone: users.phone,
              email: users.email,
            })
            .from(towOperatorMembers)
            .innerJoin(users, eq(towOperatorMembers.userId, users.id))
            .where(eq(towOperatorMembers.operatorId, ctx.workspaceId));

  const inviteRows = await db()
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.kind, kind),
        eq(workspaceInvites.workspaceId, ctx.workspaceId),
        ne(workspaceInvites.status, "cancelled"),
      ),
    )
    .orderBy(workspaceInvites.createdAt);

  const billing = await accountBilling(kind, ctx.workspaceId);
  const activeCount = memberRows.filter((m) => m.status === "active").length;
  const pendingCount = inviteRows.filter(
    (i) => i.status === "pending" && i.expiresAt > new Date(),
  ).length;

  return {
    workspaceName: ctx.workspaceName,
    role: ctx.role,
    canManage: isOwner(kind, ctx.role),
    members: memberRows.map((m) => ({
      memberId: m.memberId,
      userId: m.userId,
      name: m.name,
      phone: m.phone,
      email: m.email,
      role: m.role,
      status: m.status,
      isSelf: m.userId === userId,
    })),
    invites: inviteRows.map((i) => ({
      id: i.id,
      name: i.fullName,
      phone: i.phone,
      role: i.role,
      status: i.expiresAt <= new Date() && i.status === "pending" ? "expired" : i.status,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    maxStaff: billing?.maxStaff ?? null,
    staffCount: activeCount + pendingCount,
  };
}

// ---------------------------------------------------------------------------
// Mutations (owner only)
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  kind: z.enum(["vendor", "broker", "tow"]),
  phone: z.string().min(9).max(20),
  fullName: z.string().max(120).optional().or(z.literal("")),
  role: z.string().min(1).max(40),
});

async function sendInviteSms(input: {
  to: string;
  name: string;
  workspaceName: string;
  kind: WorkspaceKind;
  role: string;
  token: string;
}) {
  const link = appUrl(`/invite/${input.token}`);
  return sendDirectSms(input.to, "workspace_invite", {
    staff_name: input.name,
    workspace_name: input.workspaceName,
    role: roleLabel(input.kind, input.role),
    action_link: link,
  });
}

export async function inviteWorkspaceMember(
  rawInput: unknown,
): Promise<ActionResult<{ inviteId: string }>> {
  const parsed = inviteSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields" } };
  }
  const input = parsed.data;
  const kind = input.kind as WorkspaceKind;
  const owner = await requireOwner(kind);
  if (!owner.ok) return { ok: false, error: owner.error };
  const { ctx } = owner;

  if (!WORKSPACE_KINDS[kind].roles.some((r) => r.value === input.role)) {
    return { ok: false, error: { code: "VALIDATION", message: "Pick a valid role" } };
  }
  const phone = normalizeGhPhone(input.phone);
  if (!phone)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid Ghana phone number" } };

  const blocked = await accountWriteBlockReason(kind, ctx.workspaceId);
  if (blocked) return { ok: false, error: { code: "FORBIDDEN", message: blocked } };

  const billing = await accountBilling(kind, ctx.workspaceId);
  if (billing?.maxStaff != null) {
    const staff = await getWorkspaceStaff(kind);
    if (staff && staff.staffCount >= billing.maxStaff) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: `Your ${billing.planName ?? billing.planCode} plan allows ${billing.maxStaff} staff — upgrade to add more`,
        },
      };
    }
  }

  // Already a member?
  const existing = await myMembershipByPhone(kind, ctx.workspaceId, phone);
  if (existing) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "That phone already belongs to a member of this workspace",
      },
    };
  }

  const token = newInviteToken();
  const [row] = await db()
    .insert(workspaceInvites)
    .values({
      kind,
      workspaceId: ctx.workspaceId,
      fullName: input.fullName || null,
      phone,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedBy: ctx.userId,
    })
    .returning({ id: workspaceInvites.id });

  await sendInviteSms({
    to: phone,
    name: input.fullName || phone,
    workspaceName: ctx.workspaceName,
    kind,
    role: input.role,
    token,
  });

  await writeAuditLog({
    garageId: null,
    actorUserId: ctx.userId,
    action: "workspace.staff.invite",
    entityType: "workspace_invite",
    entityId: row!.id,
    after: { kind, workspaceId: ctx.workspaceId, role: input.role, phone },
  });

  return { ok: true, data: { inviteId: row!.id } };
}

async function myMembershipByPhone(kind: WorkspaceKind, workspaceId: string, phone: string) {
  const [u] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  if (!u) return null;
  const ctx = await myMembership(kind, u.id);
  return ctx && ctx.workspaceId === workspaceId ? ctx : null;
}

export async function resendWorkspaceInvite(rawInput: { kind: WorkspaceKind; inviteId: string }) {
  const owner = await requireOwner(rawInput.kind);
  if (!owner.ok) return { ok: false as const, error: owner.error };
  const { ctx } = owner;

  const [inv] = await db()
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, rawInput.inviteId),
        eq(workspaceInvites.kind, rawInput.kind),
        eq(workspaceInvites.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!inv || inv.status !== "pending")
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "Invite not found" },
    };
  if (!inv.phone)
    return {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: "Invite has no phone number" },
    };

  const token = newInviteToken();
  await db()
    .update(workspaceInvites)
    .set({
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      updatedAt: new Date(),
    })
    .where(eq(workspaceInvites.id, inv.id));
  await sendInviteSms({
    to: inv.phone,
    name: inv.fullName || inv.phone,
    workspaceName: ctx.workspaceName,
    kind: rawInput.kind,
    role: inv.role,
    token,
  });
  return { ok: true as const };
}

export async function cancelWorkspaceInvite(rawInput: { kind: WorkspaceKind; inviteId: string }) {
  const owner = await requireOwner(rawInput.kind);
  if (!owner.ok) return { ok: false as const, error: owner.error };
  await db()
    .update(workspaceInvites)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(workspaceInvites.id, rawInput.inviteId),
        eq(workspaceInvites.workspaceId, owner.ctx.workspaceId),
        eq(workspaceInvites.status, "pending"),
      ),
    );
  return { ok: true as const };
}

const memberActionSchema = z.object({
  kind: z.enum(["vendor", "broker", "tow"]),
  memberId: z.string().uuid(),
});

async function memberRow(kind: WorkspaceKind, memberId: string) {
  if (kind === "vendor") {
    const [r] = await db()
      .select()
      .from(vendorMembers)
      .where(eq(vendorMembers.id, memberId))
      .limit(1);
    return r
      ? { table: "vendor" as const, row: r, wsCol: vendorMembers.vendorId, fk: r.vendorId }
      : null;
  }
  if (kind === "broker") {
    const [r] = await db()
      .select()
      .from(brokerMembers)
      .where(eq(brokerMembers.id, memberId))
      .limit(1);
    return r
      ? { table: "broker" as const, row: r, wsCol: brokerMembers.brokerId, fk: r.brokerId }
      : null;
  }
  const [r] = await db()
    .select()
    .from(towOperatorMembers)
    .where(eq(towOperatorMembers.id, memberId))
    .limit(1);
  return r
    ? { table: "tow" as const, row: r, wsCol: towOperatorMembers.operatorId, fk: r.operatorId }
    : null;
}

async function updateMember(
  kind: WorkspaceKind,
  memberId: string,
  values: Record<string, unknown>,
) {
  if (kind === "vendor")
    await db().update(vendorMembers).set(values).where(eq(vendorMembers.id, memberId));
  else if (kind === "broker")
    await db().update(brokerMembers).set(values).where(eq(brokerMembers.id, memberId));
  else await db().update(towOperatorMembers).set(values).where(eq(towOperatorMembers.id, memberId));
}

async function deleteMember(kind: WorkspaceKind, memberId: string) {
  if (kind === "vendor") await db().delete(vendorMembers).where(eq(vendorMembers.id, memberId));
  else if (kind === "broker")
    await db().delete(brokerMembers).where(eq(brokerMembers.id, memberId));
  else await db().delete(towOperatorMembers).where(eq(towOperatorMembers.id, memberId));
}

/** Count active owners — every workspace must keep at least one. */
async function ownerCount(kind: WorkspaceKind, workspaceId: string): Promise<number> {
  const ownerRole = WORKSPACE_KINDS[kind].ownerRole;
  if (kind === "vendor") {
    const [r] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(vendorMembers)
      .where(
        and(
          eq(vendorMembers.vendorId, workspaceId),
          eq(vendorMembers.role, ownerRole),
          eq(vendorMembers.status, "active"),
        ),
      );
    return r?.n ?? 0;
  }
  if (kind === "broker") {
    const [r] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(brokerMembers)
      .where(
        and(
          eq(brokerMembers.brokerId, workspaceId),
          eq(brokerMembers.role, ownerRole),
          eq(brokerMembers.status, "active"),
        ),
      );
    return r?.n ?? 0;
  }
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(towOperatorMembers)
    .where(
      and(
        eq(towOperatorMembers.operatorId, workspaceId),
        eq(towOperatorMembers.role, ownerRole),
        eq(towOperatorMembers.status, "active"),
      ),
    );
  return r?.n ?? 0;
}

export async function updateWorkspaceMemberRole(rawInput: unknown) {
  const parsed = memberActionSchema.extend({ role: z.string().min(1).max(40) }).safeParse(rawInput);
  if (!parsed.success)
    return {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: "Check the fields" },
    };
  const { kind, memberId, role } = parsed.data as {
    kind: WorkspaceKind;
    memberId: string;
    role: string;
  };
  const owner = await requireOwner(kind);
  if (!owner.ok) return { ok: false as const, error: owner.error };

  const allowed = [
    WORKSPACE_KINDS[kind].ownerRole,
    ...WORKSPACE_KINDS[kind].roles.map((r) => r.value),
  ];
  if (!allowed.includes(role))
    return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid role" } };

  const m = await memberRow(kind, memberId);
  if (!m || m.fk !== owner.ctx.workspaceId)
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "Member not found" },
    };

  const demotingOwner =
    m.row.role === WORKSPACE_KINDS[kind].ownerRole && role !== WORKSPACE_KINDS[kind].ownerRole;
  if (demotingOwner && (await ownerCount(kind, owner.ctx.workspaceId)) <= 1) {
    return {
      ok: false as const,
      error: { code: "CONFLICT" as const, message: "A workspace must keep at least one owner" },
    };
  }
  if (m.row.userId === owner.ctx.userId && role !== m.row.role) {
    return {
      ok: false as const,
      error: {
        code: "FORBIDDEN" as const,
        message: "You can't change your own role — transfer ownership instead",
      },
    };
  }

  await updateMember(kind, memberId, { role, updatedAt: new Date() });
  await writeAuditLog({
    garageId: null,
    actorUserId: owner.ctx.userId,
    action: "workspace.staff.role_change",
    entityType: "workspace_member",
    entityId: memberId,
    before: { role: m.row.role },
    after: { role },
  });
  return { ok: true as const };
}

export async function setWorkspaceMemberStatus(rawInput: unknown) {
  const parsed = memberActionSchema
    .extend({ status: z.enum(["active", "paused"]) })
    .safeParse(rawInput);
  if (!parsed.success)
    return {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: "Check the fields" },
    };
  const { kind, memberId, status } = parsed.data as {
    kind: WorkspaceKind;
    memberId: string;
    status: "active" | "paused";
  };
  const owner = await requireOwner(kind);
  if (!owner.ok) return { ok: false as const, error: owner.error };

  const m = await memberRow(kind, memberId);
  if (!m || m.fk !== owner.ctx.workspaceId)
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "Member not found" },
    };
  if (m.row.userId === owner.ctx.userId) {
    return {
      ok: false as const,
      error: { code: "FORBIDDEN" as const, message: "You can't pause or remove yourself" },
    };
  }
  if (
    status === "paused" &&
    m.row.role === WORKSPACE_KINDS[kind].ownerRole &&
    (await ownerCount(kind, owner.ctx.workspaceId)) <= 1
  ) {
    return {
      ok: false as const,
      error: {
        code: "CONFLICT" as const,
        message: "A workspace must keep at least one active owner",
      },
    };
  }

  await updateMember(kind, memberId, { status, updatedAt: new Date() });
  await writeAuditLog({
    garageId: null,
    actorUserId: owner.ctx.userId,
    action: status === "paused" ? "workspace.staff.pause" : "workspace.staff.resume",
    entityType: "workspace_member",
    entityId: memberId,
    after: { status },
  });
  return { ok: true as const };
}

export async function removeWorkspaceMember(rawInput: unknown) {
  const parsed = memberActionSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: "Check the fields" },
    };
  const { kind, memberId } = parsed.data as { kind: WorkspaceKind; memberId: string };
  const owner = await requireOwner(kind);
  if (!owner.ok) return { ok: false as const, error: owner.error };

  const m = await memberRow(kind, memberId);
  if (!m || m.fk !== owner.ctx.workspaceId)
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "Member not found" },
    };
  if (m.row.userId === owner.ctx.userId) {
    return {
      ok: false as const,
      error: {
        code: "FORBIDDEN" as const,
        message: "You can't remove yourself — transfer ownership first",
      },
    };
  }
  if (
    m.row.role === WORKSPACE_KINDS[kind].ownerRole &&
    (await ownerCount(kind, owner.ctx.workspaceId)) <= 1
  ) {
    return {
      ok: false as const,
      error: { code: "CONFLICT" as const, message: "A workspace must keep at least one owner" },
    };
  }

  await deleteMember(kind, memberId);
  await writeAuditLog({
    garageId: null,
    actorUserId: owner.ctx.userId,
    action: "workspace.staff.remove",
    entityType: "workspace_member",
    entityId: memberId,
    before: { role: m.row.role, userId: m.row.userId },
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Accept (invitee side)
// ---------------------------------------------------------------------------

async function memberExists(kind: WorkspaceKind, workspaceId: string, userId: string) {
  if (kind === "vendor") {
    const [r] = await db()
      .select({ id: vendorMembers.id })
      .from(vendorMembers)
      .where(and(eq(vendorMembers.vendorId, workspaceId), eq(vendorMembers.userId, userId)))
      .limit(1);
    return !!r;
  }
  if (kind === "broker") {
    const [r] = await db()
      .select({ id: brokerMembers.id })
      .from(brokerMembers)
      .where(and(eq(brokerMembers.brokerId, workspaceId), eq(brokerMembers.userId, userId)))
      .limit(1);
    return !!r;
  }
  const [r] = await db()
    .select({ id: towOperatorMembers.id })
    .from(towOperatorMembers)
    .where(
      and(eq(towOperatorMembers.operatorId, workspaceId), eq(towOperatorMembers.userId, userId)),
    )
    .limit(1);
  return !!r;
}

/** Bind a pending invite to this user when their phone/email matches. */
async function claimInvite(
  inv: typeof workspaceInvites.$inferSelect,
  userId: string,
  email: string | null,
  phone: string | null,
) {
  const emailMatch = inv.email && email && inv.email.toLowerCase() === email.toLowerCase();
  const phoneMatch = inv.phone && phone && inv.phone === phone;
  if (!emailMatch && !phoneMatch) return { ok: false as const, error: "contact-mismatch" as const };
  if (await memberExists(inv.kind as WorkspaceKind, inv.workspaceId, userId)) {
    await db()
      .update(workspaceInvites)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(workspaceInvites.id, inv.id));
    return { ok: true as const, already: true as const };
  }
  await db().transaction(async (tx) => {
    await insertMemberTx(tx, inv.kind as WorkspaceKind, inv.workspaceId, userId, inv.role);
    await tx
      .update(workspaceInvites)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(workspaceInvites.id, inv.id));
  });
  return { ok: true as const };
}

async function insertMemberTx(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  kind: WorkspaceKind,
  workspaceId: string,
  userId: string,
  role: string,
) {
  if (kind === "vendor")
    await tx
      .insert(vendorMembers)
      .values({ vendorId: workspaceId, userId, role })
      .onConflictDoNothing();
  else if (kind === "broker")
    await tx
      .insert(brokerMembers)
      .values({ brokerId: workspaceId, userId, role })
      .onConflictDoNothing();
  else
    await tx
      .insert(towOperatorMembers)
      .values({ operatorId: workspaceId, userId, role })
      .onConflictDoNothing();
}

/** Auto-accept pending workspace invites on sign-in (mirrors garage invites). */
export async function acceptPendingWorkspaceInvites(
  userId: string,
  email: string,
  phone: string | null,
): Promise<number> {
  const rows = await db()
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.status, "pending"),
        gt(workspaceInvites.expiresAt, new Date()),
        or(
          email ? sql`lower(${workspaceInvites.email}) = ${email.toLowerCase()}` : undefined,
          phone ? eq(workspaceInvites.phone, phone) : undefined,
        ),
      ),
    );
  let n = 0;
  for (const inv of rows) {
    const res = await claimInvite(inv, userId, email || null, phone);
    if (res.ok) n++;
  }
  return n;
}

/** Accept via the /invite/<token> link. Returns the workspace home path. */
export async function acceptWorkspaceInvite(
  token: string,
): Promise<ActionResult<{ href: string }>> {
  const userId = await getSessionUserId();
  if (!userId)
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to accept" } };

  const [inv] = await db()
    .select()
    .from(workspaceInvites)
    .where(
      and(eq(workspaceInvites.tokenHash, hashToken(token)), eq(workspaceInvites.status, "pending")),
    )
    .limit(1);
  if (!inv)
    return { ok: false, error: { code: "NOT_FOUND", message: "Invite not found or already used" } };
  if (inv.expiresAt <= new Date()) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "This invite has expired — ask the owner to resend it" },
    };
  }

  const [me] = await db()
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const res = await claimInvite(inv, userId, me?.email ?? null, me?.phone ?? null);
  if (!res.ok) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "This invite was sent to a different phone or email" },
    };
  }

  const kind = inv.kind as WorkspaceKind;
  await writeAuditLog({
    garageId: null,
    actorUserId: userId,
    action: "workspace.staff.invite_accepted",
    entityType: "workspace_invite",
    entityId: inv.id,
    after: { kind, workspaceId: inv.workspaceId, role: inv.role },
  });
  return { ok: true, data: { href: WORKSPACE_KINDS[kind].basePath } };
}
