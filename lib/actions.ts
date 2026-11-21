import "server-only"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { memberships, auditLogs } from "@/lib/db/schema"
import { can, type Permission, type Principal } from "@/lib/auth/permissions"

/**
 * Server Action wrapper: Zod validation → membership → permission →
 * transaction → audit log → typed result.
 *
 * Result shape (never leaks raw errors):
 *   { ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }
 */

export type ActionError = {
  code:
    | "VALIDATION"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL"
  message: string
  fieldErrors?: Record<string, string[]>
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError }

const fail = <T>(error: ActionError): ActionResult<T> => ({ ok: false, error })

export type ActionContext = {
  userId: string
  garageId: string
  principal: Principal
}

type MembershipRow = typeof memberships.$inferSelect

/** Resolve the caller's active membership for a garage. */
export async function resolveMembership(
  userId: string,
  garageId: string
): Promise<MembershipRow | null> {
  // Platform-admin impersonation: acts as the garage owner while the
  // fixam_impersonate cookie is set (writes are audited with impersonated_by).
  const { getImpersonation } = await import("@/lib/admin/impersonation")
  const imp = await getImpersonation()
  if (imp && imp.adminId === userId && imp.garageId === garageId) {
    return {
      id: `impersonated:${imp.adminId}`,
      garageId,
      userId,
      branchId: null,
      role: "owner",
      status: "active",
      invitedPhone: null,
      invitedEmail: null,
      inviteTokenHash: null,
      invitedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MembershipRow
  }

  const rows = await db()
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.garageId, garageId),
        eq(memberships.status, "active")
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export async function resolvePrincipal(
  userId: string,
  garageId: string,
  isPlatformAdmin = false
): Promise<ActionContext | null> {
  if (isPlatformAdmin) {
    return { userId, garageId, principal: { kind: "platform_admin" } }
  }
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return {
    userId,
    garageId,
    principal: {
      kind: "staff",
      role: m.role as MembershipRow["role"],
      garageId,
      branchId: m.branchId,
    },
  }
}

/** Insert an audit log row (insert-only table). */
export async function writeAuditLog(entry: {
  garageId: string | null
  actorUserId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
  userAgent?: string | null
}) {
  // Tag writes made while a platform admin is impersonating this garage.
  let impersonatedBy: string | null = null
  if (entry.garageId) {
    const { getImpersonation } = await import("@/lib/admin/impersonation")
    const imp = await getImpersonation()
    if (imp && imp.garageId === entry.garageId) impersonatedBy = imp.adminId
  }

  await db().insert(auditLogs).values({
    garageId: entry.garageId,
    actorUserId: entry.actorUserId ?? null,
    impersonatedBy,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  })
}

export type WithActionOptions<TIn, TOut> = {
  /** Garage the action operates in — resolved against caller membership. */
  garageId: string
  /** Permission required, e.g. "jobs.create". Omit for member-only actions. */
  permission?: Permission | string
  /** Zod schema for input validation. */
  schema: z.ZodType<TIn>
  /** The action body. Return value becomes `data`. */
  handler: (input: TIn, ctx: ActionContext) => Promise<TOut>
  /** Audit metadata: action name + entity for the log row. */
  audit?: {
    action: string
    entityType: string
    entityId?: (input: TIn, output: TOut) => string | undefined
  }
  /** Snapshot helpers for financial/important mutations. */
  auditSnapshots?: {
    before?: (input: TIn) => unknown
    after?: (input: TIn, output: TOut) => unknown
  }
}

/**
 * Wraps a Server Action with the standard FixAm pipeline.
 * `userId` and `isPlatformAdmin` come from the verified session — never
 * from client input.
 */
/** Bound variant — call inside a Server Action file. */
export function action<TIn, TOut>(
  opts: WithActionOptions<TIn, TOut> & { userId: string; isPlatformAdmin: boolean }
): (rawInput: unknown) => Promise<ActionResult<TOut>> {
  return async (rawInput: unknown) => {
    const { userId, isPlatformAdmin, ...rest } = opts

    // 1. Validate input
    const parsed = rest.schema.safeParse(rawInput)
    if (!parsed.success) {
      return fail({
        code: "VALIDATION",
        message: "Invalid input",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<
          string,
          string[]
        >,
      })
    }
    const input = parsed.data

    // 2. Resolve membership / principal
    const ctx = await resolvePrincipal(userId, rest.garageId, isPlatformAdmin)
    if (!ctx) {
      return fail({ code: "UNAUTHENTICATED", message: "Not a member of this garage" })
    }

    // 3. Permission check
    if (rest.permission && !can(ctx.principal, rest.permission)) {
      return fail({ code: "FORBIDDEN", message: "You don't have permission for this" })
    }

    // 3b. Subscription gate — audited actions are mutations; lapsed garages are read-only
    if (rest.audit && ctx.principal.kind === "staff") {
      const { writeBlockReason } = await import("@/lib/billing/core")
      const blocked = await writeBlockReason(ctx.garageId)
      if (blocked) return fail({ code: "FORBIDDEN", message: blocked })
    }

    // 4. Run handler + audit
    try {
      const output = await rest.handler(input, ctx)

      if (rest.audit) {
        await writeAuditLog({
          garageId: ctx.garageId,
          actorUserId: userId,
          action: rest.audit.action,
          entityType: rest.audit.entityType,
          entityId: rest.audit.entityId?.(input, output),
          before: rest.auditSnapshots?.before?.(input),
          after: rest.auditSnapshots?.after?.(input, output),
        })
      }

      return { ok: true, data: output }
    } catch (e) {
      console.error("[action]", rest.audit?.action ?? "unknown", e)
      return fail({ code: "INTERNAL", message: "Something went wrong" })
    }
  }
}
