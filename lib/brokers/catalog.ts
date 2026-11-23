/** Broker service catalogue + status labels (shared by server and client). */

export type BrokerKind = "insurance" | "dvla" | "both"
export type RequestKind = "insurance" | "dvla"

export const SERVICE_TYPES: Record<RequestKind, { value: string; label: string }[]> = {
  insurance: [
    { value: "comprehensive", label: "Comprehensive" },
    { value: "third_party", label: "Third party" },
    { value: "third_party_fire_theft", label: "Third party, fire & theft" },
  ],
  dvla: [
    { value: "roadworthy", label: "Roadworthy certificate" },
    { value: "registration_licence", label: "Vehicle licence (road use)" },
    { value: "drivers_licence", label: "Driver's licence renewal" },
    { value: "change_of_ownership", label: "Change of ownership" },
  ],
}

export function serviceLabel(kind: string, value: string) {
  return SERVICE_TYPES[kind as RequestKind]?.find((s) => s.value === value)?.label ?? value.replace(/_/g, " ")
}

export const REQUEST_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "ok" | "danger" | "accent" }> = {
  requested: { label: "New request", tone: "info" },
  quoted: { label: "Quote sent", tone: "warning" },
  accepted: { label: "Quote accepted", tone: "ok" },
  in_progress: { label: "Processing", tone: "accent" },
  completed: { label: "Completed", tone: "ok" },
  declined: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

export const OPEN_STATUSES = ["requested", "quoted", "accepted", "in_progress"] as const

export const INSURERS = [
  "Enterprise Insurance",
  "SIC Insurance",
  "Star Assurance",
  "Hollard Insurance",
  "GLICO General",
  "Vanguard Assurance",
  "Activa International",
  "Phoenix Insurance",
  "Allianz Insurance",
  "Donewell Insurance",
  "Prime Insurance",
  "Millennium Insurance",
]

export function kindLabel(kind: string) {
  return kind === "dvla" ? "DVLA" : kind === "both" ? "Insurance & DVLA" : "Insurance"
}
