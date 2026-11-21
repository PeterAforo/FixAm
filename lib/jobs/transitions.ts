/**
 * Job status machine — mirrors data-model.json domain_rules.job_status_transitions.
 * Server-side enforcement: invalid transitions are rejected.
 */

export const JOB_STATUSES = [
  "booked",
  "checked_in",
  "diagnosing",
  "estimate_sent",
  "approved",
  "declined",
  "in_progress",
  "waiting_parts",
  "quality_check",
  "ready",
  "delivered",
  "closed",
  "cancelled",
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  booked: ["checked_in", "cancelled"],
  checked_in: ["diagnosing", "estimate_sent", "in_progress", "cancelled"],
  diagnosing: ["estimate_sent", "cancelled"],
  estimate_sent: ["approved", "declined", "diagnosing"],
  approved: ["in_progress", "waiting_parts"],
  declined: ["ready", "estimate_sent", "closed"],
  in_progress: ["waiting_parts", "quality_check", "estimate_sent"],
  waiting_parts: ["in_progress"],
  quality_check: ["in_progress", "ready"],
  ready: ["delivered"],
  delivered: ["closed"],
  closed: [],
  cancelled: [],
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

export function nextStatuses(from: JobStatus): JobStatus[] {
  return JOB_STATUS_TRANSITIONS[from] ?? []
}
