/**
 * Vehicle passport (P8-10) — pure helpers, no database.
 *
 * The public page shows what was done to a car and when, at which garage,
 * plus a mileage history and whether road papers are current. It never
 * shows the owner's name or phone, prices, notes or the complaint text.
 */
import { randomBytes } from "crypto"

/** URL-safe public token (~96 bits). */
export function newPassportToken(): string {
  return randomBytes(12).toString("base64url")
}

export function isPassportToken(s: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(s)
}

/** A drop of more than this (km) between readings counts as "mileage went down". */
export const ROLLBACK_TOLERANCE_KM = 500

export type MileagePoint = { km: number; at: string; odometerReplaced?: boolean }
export type MileageCheck =
  | { status: "none" }
  | { status: "consistent"; latestKm: number; latestAt: string; readings: number }
  | { status: "dropped"; latestKm: number; latestAt: string; readings: number; droppedOn: string; fromKm: number; toKm: number }

/**
 * Sorts readings by date and looks for a drop in mileage. A reading marked
 * as "odometer replaced" resets the baseline instead of counting as a drop.
 */
export function checkMileage(points: MileagePoint[]): MileageCheck {
  const pts = points.filter((p) => Number.isFinite(p.km) && p.km >= 0).sort((a, b) => a.at.localeCompare(b.at))
  if (!pts.length) return { status: "none" }
  const latest = pts[pts.length - 1]
  let maxKm = pts[0].km
  let drop: { on: string; from: number; to: number } | null = null
  for (const p of pts.slice(1)) {
    if (p.odometerReplaced) { maxKm = p.km; continue }
    if (p.km < maxKm - ROLLBACK_TOLERANCE_KM && !drop) drop = { on: p.at, from: maxKm, to: p.km }
    maxKm = Math.max(maxKm, p.km)
  }
  const base = { latestKm: latest.km, latestAt: latest.at, readings: pts.length }
  return drop ? { status: "dropped", ...base, droppedOn: drop.on, fromKm: drop.from, toKm: drop.to } : { status: "consistent", ...base }
}

/** Mileage readings for the page, thinned to at most one per month. */
export function mileageTimeline(points: MileagePoint[], max = 24): { km: number; month: string }[] {
  const byMonth = new Map<string, number>()
  for (const p of [...points].sort((a, b) => a.at.localeCompare(b.at))) byMonth.set(p.at.slice(0, 7), p.km)
  return [...byMonth.entries()].slice(-max).map(([month, km]) => ({ month, km }))
}

export type VisitItem = { type: string; description: string; approvalStatus: string | null; oldPartProof: string | null }

/**
 * What a visit shows: approved labour and part lines, de-duplicated, with
 * prices and sundries left out. Counts parts replaced with proof.
 */
export function summariseVisit(items: VisitItem[], max = 8): { work: string[]; more: number; partsWithProof: number } {
  const seen = new Set<string>()
  const work: string[] = []
  let partsWithProof = 0
  for (const i of items) {
    if (i.type !== "labour" && i.type !== "part") continue
    if (i.approvalStatus === "declined") continue
    if (i.type === "part" && (i.oldPartProof === "photo" || i.oldPartProof === "customer_took")) partsWithProof++
    const d = tidy(i.description)
    if (!d) continue
    const k = d.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    work.push(d)
  }
  return { work: work.slice(0, max), more: Math.max(0, work.length - max), partsWithProof }
}

/** Strips anything that looks like a phone number or e-mail from a line. */
export function tidy(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "")
    .replace(/(\+?233|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120)
}

export type PaperStatus = { label: string; status: "valid" | "expired"; until: string }

const PAPER_LABEL: Record<string, string> = {
  insurance: "Insurance",
  roadworthy: "Roadworthy certificate",
  registration_licence: "Vehicle registration",
}

/** Latest expiry per paper type → valid/expired with month only (no numbers). */
export function paperStatuses(papers: { kind: string; expiry: string }[], todayISO: string): PaperStatus[] {
  const latest = new Map<string, string>()
  for (const p of papers) {
    if (!PAPER_LABEL[p.kind]) continue
    if (!latest.has(p.kind) || p.expiry > latest.get(p.kind)!) latest.set(p.kind, p.expiry)
  }
  return Object.keys(PAPER_LABEL)
    .filter((k) => latest.has(k))
    .map((k) => {
      const until = latest.get(k)!
      return { label: PAPER_LABEL[k], status: until >= todayISO ? "valid" : "expired", until: until.slice(0, 7) }
    })
}

export function passportUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return `${base.replace(/\/$/, "")}/v/${token}`
}
