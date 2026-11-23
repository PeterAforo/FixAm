/**
 * Car pickup & drop-off (P8-16) — pure helpers, no database.
 */

export const PHOTO_SIDES = [
  { id: "front", label: "Front" },
  { id: "rear", label: "Back" },
  { id: "left", label: "Left side" },
  { id: "right", label: "Right side" },
  { id: "interior", label: "Inside" },
  { id: "dashboard", label: "Dashboard (lights & mileage)" },
] as const
export type PhotoSide = (typeof PHOTO_SIDES)[number]["id"]
export const PHOTO_SIDE_IDS = PHOTO_SIDES.map((s) => s.id) as PhotoSide[]

export type RunStatus = "unconfirmed" | "scheduled" | "assigned" | "en_route" | "arrived" | "done" | "cancelled"
export const OPEN_RUN: RunStatus[] = ["scheduled", "assigned", "en_route", "arrived"]

const NEXT: Partial<Record<RunStatus, RunStatus[]>> = {
  scheduled: ["en_route"],
  assigned: ["en_route"],
  en_route: ["arrived"],
  arrived: ["done"], // only with a condition report
}
export function canMoveRun(from: string, to: string): boolean {
  return (NEXT[from as RunStatus] ?? []).includes(to as RunStatus)
}

export const RUN_LABEL: Record<"pickup" | "dropoff", Record<RunStatus, string>> = {
  pickup: {
    unconfirmed: "Waiting for booking confirmation", scheduled: "Pickup booked", assigned: "Driver assigned",
    en_route: "Driver on the way to you", arrived: "Driver has arrived", done: "Car collected — on its way to the garage", cancelled: "Pickup cancelled",
  },
  dropoff: {
    unconfirmed: "Waiting", scheduled: "Return booked", assigned: "Driver assigned",
    en_route: "Your car is on its way back", arrived: "Driver has arrived with your car", done: "Car returned", cancelled: "Return cancelled",
  },
}

export type ReportInput = {
  photos: Partial<Record<PhotoSide, string>>
  fuelLevel: number | null
  odometerKm: number | null
  signatureProvided: boolean
  signedByName: string
}

/** What's still missing before the handover can be completed. */
export function reportProblems(r: ReportInput): string[] {
  const missing = PHOTO_SIDES.filter((s) => !r.photos[s.id]).map((s) => s.label.toLowerCase())
  const out: string[] = []
  if (missing.length) out.push(`Photos missing: ${missing.join(", ")}`)
  if (r.fuelLevel == null || r.fuelLevel < 0 || r.fuelLevel > 100) out.push("Set the fuel level")
  if (r.odometerKm == null || r.odometerKm < 0) out.push("Enter the mileage")
  if (!r.signatureProvided) out.push("The customer needs to sign")
  if (r.signedByName.trim().length < 2) out.push("Enter the name of the person signing")
  return out
}

/** Differences between the pickup and drop-off reports worth showing the customer. */
export function compareReports(a: { odometerKm: number | null; fuelLevel: number | null; warningLights: string[] }, b: { odometerKm: number | null; fuelLevel: number | null; warningLights: string[] }) {
  const km = a.odometerKm != null && b.odometerKm != null ? b.odometerKm - a.odometerKm : null
  const fuel = a.fuelLevel != null && b.fuelLevel != null ? b.fuelLevel - a.fuelLevel : null
  const newLights = b.warningLights.filter((l) => !a.warningLights.includes(l))
  const clearedLights = a.warningLights.filter((l) => !b.warningLights.includes(l))
  return { kmDriven: km, fuelChange: fuel, newLights, clearedLights }
}

export const fuelLabel = (p: number | null) => (p == null ? "—" : p <= 5 ? "Empty" : p >= 95 ? "Full" : `${p}%`)
