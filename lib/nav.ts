import uiScreens from "../docs/devin-spec/specs/ui-screens.json"
import type { StaffRole } from "./auth/permissions"

/**
 * Role-aware navigation derived from specs/ui-screens.json (single source).
 */

export type NavItem = {
  label: string
  icon: string
  route: string // e.g. /g/[garageSlug]/jobs
  roles: StaffRole[]
  children?: string[]
}

const staffNav = (uiScreens.navigation as { staff: NavItem[] }).staff
const bottomBar = (uiScreens.navigation as { mobile_bottom_bar: Record<string, string[]> })
  .mobile_bottom_bar

export function navForRole(role: StaffRole): NavItem[] {
  return staffNav.filter((item) => item.roles.includes(role))
}

export function bottomBarForRole(role: StaffRole): string[] {
  return bottomBar[role] ?? []
}

/** Resolve a nav label to its route for the bottom bar / palette. */
export function routeForLabel(
  role: StaffRole,
  label: string
): string | undefined {
  const item = navForRole(role).find((i) => i.label === label)
  if (item) return item.route
  // "Check in" FAB has no nav item — map to check-in route
  if (label === "+ Check in") return "/g/[garageSlug]/check-in"
  return undefined
}

export function navItemForPath(
  role: StaffRole,
  pathname: string,
  garageSlug: string
): NavItem | undefined {
  const base = `/g/${garageSlug}`
  return navForRole(role)
    .filter((i) => pathname === `${base}${i.route.replace("/g/[garageSlug]", "")}` ||
      pathname.startsWith(`${base}${i.route.replace("/g/[garageSlug]", "")}/`))
    .sort((a, b) => b.route.length - a.route.length)[0]
}
