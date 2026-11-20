import { describe, expect, it } from "vitest"
import {
  can,
  discountLimitPercent,
  garageHasFeature,
  isBranchScoped,
  planLimits,
  type Principal,
  type StaffRole,
} from "./permissions"

const staff = (role: StaffRole, branchId: string | null = null): Principal => ({
  kind: "staff",
  role,
  garageId: "g1",
  branchId,
})

describe("can() — staff permissions", () => {
  it("owner can do everything staff-side", () => {
    for (const p of [
      "garage.settings.manage",
      "garage.staff.manage",
      "jobs.create",
      "invoices.issue",
      "stock.adjust",
      "audit_log.view",
    ]) {
      expect(can(staff("owner"), p)).toBe(true)
    }
  })

  it("mechanic is branch-scoped and limited", () => {
    expect(isBranchScoped("mechanic")).toBe(true)
    expect(can(staff("mechanic"), "jobs.view_assigned")).toBe(true)
    expect(can(staff("mechanic"), "jobs.view")).toBe(false)
    expect(can(staff("mechanic"), "parts.manage")).toBe(false)
    expect(can(staff("mechanic"), "garage.settings.manage")).toBe(false)
  })

  it("service advisor cannot manage staff", () => {
    expect(can(staff("service_advisor"), "garage.staff.manage")).toBe(false)
    expect(can(staff("service_advisor"), "estimates.send")).toBe(true)
  })

  it("accountant sees money but not workshop ops", () => {
    expect(can(staff("accountant"), "invoices.view")).toBe(true)
    expect(can(staff("accountant"), "expenses.manage")).toBe(true)
    expect(can(staff("accountant"), "jobs.create")).toBe(false)
  })

  it("storekeeper manages stock, not customers' credit", () => {
    expect(can(staff("storekeeper"), "stock.adjust")).toBe(true)
    expect(can(staff("storekeeper"), "customers.credit_limit.set")).toBe(false)
    expect(can(staff("storekeeper"), "pos.sell")).toBe(true)
  })

  it("unknown permissions deny", () => {
    expect(can(staff("owner"), "does.not.exist")).toBe(false)
  })

  it("platform admin bypasses everything", () => {
    expect(can({ kind: "platform_admin" }, "admin.garages.manage")).toBe(true)
    expect(can({ kind: "platform_admin" }, "anything.at.all")).toBe(true)
  })
})

describe("can() — branch scoping", () => {
  it("branch-scoped role denied outside its branch", () => {
    const advisor = staff("service_advisor", "branch-a")
    expect(can(advisor, "jobs.view", { branchId: "branch-a" })).toBe(true)
    expect(can(advisor, "jobs.view", { branchId: "branch-b" })).toBe(false)
  })

  it("garage-scoped roles unaffected by branch context", () => {
    const owner = staff("owner", null)
    expect(can(owner, "jobs.view", { branchId: "branch-b" })).toBe(true)
  })
})

describe("can() — customer & vendor principals", () => {
  it("customer can approve own estimates only", () => {
    const customer: Principal = { kind: "customer", customerType: "private" }
    expect(can(customer, "estimates.approve_own")).toBe(true)
    expect(can(customer, "estimates.send")).toBe(false)
    expect(can(customer, "jobs.view")).toBe(false)
  })

  it("fleet manager gets fleet permissions", () => {
    const fleet: Principal = { kind: "customer", customerType: "fleet" }
    expect(can(fleet, "marketplace.order_for_own_vehicle")).toBe(true)
    expect(can(fleet, "renewals.request_own")).toBe(true)
  })

  it("vendor roles", () => {
    expect(can({ kind: "vendor", vendorRole: "owner" }, "vendor.orders.fulfil")).toBe(true)
    expect(can({ kind: "vendor", vendorRole: "staff" }, "vendor.payouts.view")).toBe(false)
  })
})

describe("discountLimitPercent", () => {
  it("resolves per-role limits", () => {
    expect(discountLimitPercent("owner")).toBe("unlimited")
    expect(discountLimitPercent("manager")).toBe(20)
    expect(discountLimitPercent("service_advisor", 15)).toBe(15)
    expect(discountLimitPercent("service_advisor")).toBe(10) // default setting
    expect(discountLimitPercent("mechanic")).toBe(0)
  })
})

describe("garageHasFeature / planLimits", () => {
  it("starter lacks agent renewals and credit accounts", () => {
    expect(garageHasFeature("starter", "agent_renewals")).toBe(false)
    expect(garageHasFeature("starter", "credit_accounts")).toBe(false)
    expect(garageHasFeature("starter", "core_workshop")).toBe(true)
  })

  it("growth adds renewals, credit, branding", () => {
    expect(garageHasFeature("growth", "agent_renewals")).toBe(true)
    expect(garageHasFeature("growth", "custom_branding")).toBe(true)
    expect(garageHasFeature("growth", "fleet_accounts")).toBe(false)
  })

  it("pro has everything", () => {
    for (const f of ["agent_renewals", "fleet_accounts", "auto_reorder", "priority_support"]) {
      expect(garageHasFeature("pro", f)).toBe(true)
    }
  })

  it("planLimits returns caps", () => {
    expect(planLimits("starter")).toMatchObject({ maxBranches: 1, maxStaff: 5 })
    expect(planLimits("nonexistent")).toBeNull()
  })
})
