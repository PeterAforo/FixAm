"use server"
import { createHash, randomBytes } from "crypto"
import { z } from "zod"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages, memberships, users } from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { normalizeGhPhone } from "@/lib/phone"
import { sendMessage } from "@/lib/messaging/send"

const STAFF_ROLES = [
  "manager",
  "service_advisor",
  "mechanic",
  "storekeeper",
  "accountant",
  "garage_driver",
  "inspector",
] as const

const roleSchema = z.enum(STAFF_ROLES)

const inviteSchema = z
  .object({
    phone: z.string().optional().or(z.literal("")),
    email: z.string().email().optional().or(z.literal("")),
    role: roleSchema,
    branchId: z.string().uuid().nullable().optional(),
    fullName: z.string().max(120).optional().or(z.literal("")),
  })
  .refine((v) => Boolean(v.phone || v.email), {
    message: "Phone or email is required",
  })

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function newInviteToken() {
  return randomBytes(24).toString("base64url")
}

/** Invite staff member; sends staff_invite via the messaging pipeline (mock locally). */
export async function inviteStaff(rawInput: unknown): Promise<
  ActionResult<{ membershipId: string }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = inviteSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const input = parsed.data
  const phone = input.phone ? normalizeGhPhone(input.phone) : null
  if (input.phone && !phone) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid Ghana phone number" } }
  }

  // Resolve the caller's garage from their active membership (single-garage v1 UX:
  // staff page passes garageId explicitly in input)
  const garageId = (rawInput as { garageId?: string }).garageId
  if (!garageId) {
    return { ok: false, error: { code: "VALIDATION", message: "garageId required" } }
  }

  const membership = await resolveMembership(userId, garageId)
  if (!membership) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  }

  // Permission check via permissions engine
  const { can } = await import("@/lib/auth/permissions")
  const principal =
    membership.role === "owner" || membership.role === "manager"
      ? { kind: "staff" as const, role: membership.role, garageId, branchId: membership.branchId }
      : null
  if (!principal || !can(principal, "garage.staff.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only owner/manager can invite staff" } }
  }

  const garage = await db().select().from(garages).where(eq(garages.id, garageId)).limit(1)
  if (!garage[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Garage not found" } }

  // plan limits + subscription write gate
  const { garageBilling, countActiveStaff, writeBlockReason } = await import("@/lib/billing/core")
  const blocked = await writeBlockReason(garageId)
  if (blocked) return { ok: false, error: { code: "FORBIDDEN", message: blocked } }
  const billing = await garageBilling(garageId)
  if (billing?.maxStaff != null) {
    const staffCount = await countActiveStaff(garageId)
    if (staffCount >= billing.maxStaff) {
      return { ok: false, error: { code: "FORBIDDEN", message: `Your ${billing.planName ?? billing.planCode} plan allows ${billing.maxStaff} staff — upgrade to add more` } }
    }
  }

  const token = newInviteToken()
  const [row] = await db()
    .insert(memberships)
    .values({
      garageId,
      userId: null,
      branchId: input.branchId ?? null,
      role: input.role,
      status: "invited",
      invitedPhone: phone,
      invitedEmail: input.email || null,
      inviteTokenHash: hashToken(token),
      invitedBy: userId,
    })
    .returning({ id: memberships.id })

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/invite/${token}`
  const staffName = input.fullName || phone || input.email || "there"
  const channel = phone ? "sms" : "email"

  try {
    await sendMessage({
      garageId,
      channel,
      to: phone ?? input.email!,
      templateKey: "staff_invite",
      variables: {
        staff_name: staffName,
        garage_name: garage[0].name,
        action_link: link,
      },
      idempotencyKey: `invite:${row!.id}`,
    })
  } catch (e) {
    console.error("[staff] invite message failed", e)
  }

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "staff.invite",
    entityType: "membership",
    entityId: row!.id,
    after: { role: input.role, phone, email: input.email },
  })

  return { ok: true, data: { membershipId: row!.id } }
}

/** Accept an invite by token — binds the membership to the signed-in user. */
export async function acceptInvite(token: string): Promise<ActionResult<{ garageSlug: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to accept" } }

  const [row] = await db()
    .select({ m: memberships, g: garages })
    .from(memberships)
    .innerJoin(garages, eq(memberships.garageId, garages.id))
    .where(
      and(
        eq(memberships.inviteTokenHash, hashToken(token)),
        eq(memberships.status, "invited")
      )
    )
    .limit(1)

  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Invite not found or already used" } }
  if (row.g.status === "suspended") {
    return { ok: false, error: { code: "FORBIDDEN", message: "This garage is suspended on FixAm. Ask the owner to contact FixAm support." } }
  }

  // Bind to this user if the invite contact matches the user's email/phone
  const me = await db().select().from(users).where(eq(users.id, userId)).limit(1)
  const myEmail = me[0]?.email?.toLowerCase()
  const myPhone = me[0]?.phone
  const emailMatch = row.m.invitedEmail && row.m.invitedEmail.toLowerCase() === myEmail
  const phoneMatch = row.m.invitedPhone && row.m.invitedPhone === myPhone
  if (!emailMatch && !phoneMatch) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "This invite was sent to a different phone or email",
      },
    }
  }

  await db()
    .update(memberships)
    .set({
      userId,
      status: "active",
      inviteTokenHash: null,
      updatedAt: new Date(),
    })
    .where(eq(memberships.id, row.m.id))

  await writeAuditLog({
    garageId: row.m.garageId,
    actorUserId: userId,
    action: "staff.invite_accepted",
    entityType: "membership",
    entityId: row.m.id,
    after: { role: row.m.role },
  })

  return { ok: true, data: { garageSlug: row.g.slug } }
}

const updateRoleSchema = z.object({
  garageId: z.string().uuid(),
  membershipId: z.string().uuid(),
  role: roleSchema,
})

export async function updateMemberRole(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const input = updateRoleSchema.safeParse(rawInput)
  if (!input.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const { garageId, membershipId, role } = input.data
  const me = await resolveMembership(userId, garageId)
  if (!me || (me.role !== "owner" && me.role !== "manager")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only owner/manager can change roles" } }
  }
  if (me.role === "manager") {
    // managers can't promote to owner-equivalent or touch other managers lightly — keep simple:
    const target = await db()
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.id, membershipId), eq(memberships.garageId, garageId)))
      .limit(1)
    if (!target[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Member not found" } }
    if (role === "manager" && target[0].role !== "manager") {
      return { ok: false, error: { code: "FORBIDDEN", message: "Managers can't assign manager role" } }
    }
  }

  const before = await db()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.garageId, garageId)))
    .limit(1)
  if (!before[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Member not found" } }
  if (before[0].role === "owner") {
    return { ok: false, error: { code: "FORBIDDEN", message: "Can't change the owner's role" } }
  }

  await db()
    .update(memberships)
    .set({ role, updatedAt: new Date() })
    .where(eq(memberships.id, membershipId))

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "staff.role_change",
    entityType: "membership",
    entityId: membershipId,
    before: { role: before[0].role },
    after: { role },
  })
  return { ok: true, data: { ok: true as const } }
}

const statusSchema = z.object({
  garageId: z.string().uuid(),
  membershipId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
})

export async function setMemberStatus(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const input = statusSchema.safeParse(rawInput)
  if (!input.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const { garageId, membershipId, status } = input.data
  const me = await resolveMembership(userId, garageId)
  if (!me || (me.role !== "owner" && me.role !== "manager")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only owner/manager can suspend members" } }
  }

  const target = await db()
    .select({ role: memberships.role, userId: memberships.userId, status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.garageId, garageId)))
    .limit(1)
  if (!target[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Member not found" } }
  if (target[0].role === "owner") {
    return { ok: false, error: { code: "FORBIDDEN", message: "Can't suspend the owner" } }
  }
  if (status === "active" && target[0].status !== "suspended") {
    return { ok: true, data: { ok: true as const } }
  }

  await db()
    .update(memberships)
    .set({ status, updatedAt: new Date() })
    .where(eq(memberships.id, membershipId))

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: status === "suspended" ? "staff.suspend" : "staff.reactivate",
    entityType: "membership",
    entityId: membershipId,
    before: { status: target[0].status },
    after: { status },
  })
  return { ok: true, data: { ok: true as const } }
}

/** List memberships for the staff page. */
export async function listStaff(garageId: string) {
  const rows = await db()
    .select({
      id: memberships.id,
      role: memberships.role,
      status: memberships.status,
      invitedPhone: memberships.invitedPhone,
      invitedEmail: memberships.invitedEmail,
      branchId: memberships.branchId,
      branchName: branches.name,
      userId: memberships.userId,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
    })
    .from(memberships)
    .leftJoin(users, eq(memberships.userId, users.id))
    .leftJoin(branches, eq(memberships.branchId, branches.id))
    .where(and(eq(memberships.garageId, garageId), isNull(memberships.deletedAt)))

  return rows
}
