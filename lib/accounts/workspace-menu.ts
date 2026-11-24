import { navForRole } from "@/lib/nav"
import type { StaffRole } from "@/lib/auth/permissions"
import type { Workspace } from "./workspaces"

export type MenuItem = { label: string; href: string }

/** Short kind label per workspace (client-safe copy of WORKSPACE_LABEL). */
export const WORKSPACE_KIND: Record<Workspace["type"], string> = {
  admin: "Platform admin",
  driver: "Driver",
  garage: "Garage",
  vendor: "Parts shop",
  broker: "Broker",
  tow: "Towing",
  rider: "Rider",
}

/** Driver ("My cars") menu — shared by the portal sidebar and other workspaces' sidebars. */
export const DRIVER_MENU: MenuItem[] = [
  { label: "Home", href: "/portal" },
  { label: "Repairs", href: "/portal/requests" },
  { label: "Parts & orders", href: "/portal/parts" },
  { label: "Renewals", href: "/portal/renewals" },
  { label: "Claims", href: "/portal/claims" },
  { label: "Car inspections", href: "/portal/inspections" },
  { label: "Pay later", href: "/portal/financing" },
  { label: "Price check", href: "/portal/price-check" },
  { label: "Profile & notifications", href: "/portal/settings" },
]

const MENUS: Record<Exclude<Workspace["type"], "garage" | "driver">, MenuItem[]> = {
  admin: [
    { label: "Overview", href: "/admin" },
    { label: "Garages", href: "/admin/garages" },
    { label: "Approvals", href: "/admin/approvals" },
    { label: "Payments & payouts", href: "/admin/payments" },
  ],
  vendor: [
    { label: "My shop", href: "/vendor" },
    { label: "Staff", href: "/vendor/staff" },
  ],
  broker: [
    { label: "Overview", href: "/broker" },
    { label: "Requests", href: "/broker/requests" },
    { label: "Claims", href: "/broker/claims" },
    { label: "Staff", href: "/broker/staff" },
    { label: "Settings", href: "/broker/settings" },
  ],
  tow: [
    { label: "Jobs", href: "/tow" },
    { label: "Staff", href: "/tow/staff" },
    { label: "Settings", href: "/tow/settings" },
  ],
  rider: [
    { label: "Deliveries", href: "/rider" },
    { label: "Earnings", href: "/rider/earnings" },
  ],
}

/** Garage sections whose first page is a sub-page (mirrors the garage sidebar). */
const GARAGE_FIRST_CHILD: Record<string, string> = { "Parts & stock": "/parts", Money: "/invoices", Settings: "/settings" }

/**
 * The menu a workspace shows when it is NOT the one open: the same items its
 * own sidebar has (garage items filtered by the person's role there).
 */
export function workspaceMenu(w: Workspace): MenuItem[] {
  if (w.type === "driver") return DRIVER_MENU
  if (w.type === "garage") {
    const base = w.href
    return navForRole((w.role ?? "mechanic") as StaffRole).map((item) => {
      const own = item.route.replace("/g/[garageSlug]", "")
      return { label: item.label, href: `${base}${GARAGE_FIRST_CHILD[item.label] ?? own}` }
    })
  }
  return MENUS[w.type]
}

/** Link that opens a page in another workspace and remembers it as last used. */
export function switchHref(w: Workspace, href: string) {
  return `/switch/${encodeURIComponent(w.key)}?to=${encodeURIComponent(href)}`
}

/**
 * Which workspace a user lands in when they haven't picked a default: the
 * business they work in comes before their own car, and owners before staff.
 */
const RANK: Record<Workspace["type"], number> = { garage: 0, vendor: 1, broker: 2, tow: 3, rider: 4, admin: 5, driver: 6 }

export function rankWorkspaces<W extends Pick<Workspace, "type" | "role">>(list: W[]): W[] {
  return [...list].sort((a, b) => RANK[a.type] - RANK[b.type] || Number(b.role === "owner") - Number(a.role === "owner"))
}
