import rolesSpec from "../../docs/devin-spec/specs/roles-permissions.json"
import plansSpec from "../../docs/devin-spec/specs/plans.json"

/**
 * Permissions engine — single source: specs/roles-permissions.json.
 * can(role, permission) for staff; garageHasFeature(plan, feature) for plans.
 */

export type StaffRole =
  | "owner"
  | "manager"
  | "service_advisor"
  | "mechanic"
  | "storekeeper"
  | "accountant"
  | "garage_driver"
  | "inspector"

export type Principal =
  | { kind: "staff"; role: StaffRole; garageId: string; branchId?: string | null }
  | { kind: "platform_admin" }
  | { kind: "customer"; customerType?: "private" | "business" | "fleet" }
  | { kind: "vendor"; vendorRole?: "owner" | "staff" }

export type Permission = keyof typeof rolesSpec.permissions & string

type RoleGrant = string[] | Record<string, string>

const grants = rolesSpec.permissions as Record<string, RoleGrant>

const BRANCH_SCOPED: StaffRole[] = ["manager", "service_advisor", "mechanic", "storekeeper"]

/** Roles whose scope is a single branch (membership.branch_id). */
export function isBranchScoped(role: StaffRole): boolean {
  return BRANCH_SCOPED.includes(role)
}

function grantFor(permission: string, role: string): string | string[] | undefined {
  const grant = grants[permission]
  if (!grant) return undefined
  if (Array.isArray(grant)) return grant.includes(role) ? role : undefined
  // Object form: keys are roles, values are limit descriptors
  return role in grant ? grant[role] : undefined
}

/** Boolean permission check. Unknown permissions deny by default. */
export function can(
  principal: Principal,
  permission: string,
  context?: { garageId?: string; branchId?: string | null }
): boolean {
  if (principal.kind === "platform_admin") return true

  const role =
    principal.kind === "staff"
      ? principal.role
      : principal.kind === "customer"
        ? principal.customerType === "business" || principal.customerType === "fleet"
          ? "fleet_manager"
          : "customer"
        : principal.vendorRole === "owner"
          ? "vendor_owner"
          : "vendor_staff"

  const grant = grantFor(permission, role)
  if (grant === undefined) return false

  // Branch-scoped staff acting outside their membership branch are denied
  // for branch-scoped permissions (callers pass the target branch).
  if (
    principal.kind === "staff" &&
    isBranchScoped(principal.role) &&
    context?.branchId !== undefined &&
    principal.branchId != null &&
    context.branchId !== principal.branchId
  ) {
    return false
  }

  return true
}

/** Discount limit for a role, resolved against garage settings. */
export function discountLimitPercent(
  role: StaffRole,
  garageSetting?: number
): number | "unlimited" {
  const grant = grants["pricing.discount.apply"] as Record<string, string>
  const rule = grant[role]
  if (!rule) return 0
  if (rule === "unlimited") return "unlimited"
  if (rule.startsWith("max_percent:")) {
    const v = rule.slice("max_percent:".length)
    if (v === "garage_setting(advisor_discount_limit_percent)") {
      return garageSetting ?? 10
    }
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export type PlanCode = "starter" | "growth" | "pro"

const planByCode = new Map(plansSpec.plans.map((p) => [p.code, p]))

/** Whether a plan includes a feature key (e.g. "marketplace", "agent_renewals"). */
export function garageHasFeature(planCode: string, feature: string): boolean {
  const plan = planByCode.get(planCode as PlanCode)
  return plan ? (plan.features as string[]).includes(feature) : false
}

export function planLimits(planCode: string) {
  const plan = planByCode.get(planCode as PlanCode)
  if (!plan) return null
  return {
    maxBranches: plan.max_branches,
    maxStaff: plan.max_staff,
    messageAllowance: plan.message_allowance,
  }
}
