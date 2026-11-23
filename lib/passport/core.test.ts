import { describe, expect, it } from "vitest"
import { checkMileage, isPassportToken, mileageTimeline, newPassportToken, paperStatuses, summariseVisit, tidy } from "./core"

describe("passport tokens", () => {
  it("are 16 url-safe characters", () => {
    const t = newPassportToken()
    expect(isPassportToken(t)).toBe(true)
    expect(isPassportToken("short")).toBe(false)
    expect(isPassportToken("abc/def?ghijklmn")).toBe(false)
  })
})

describe("checkMileage", () => {
  it("is consistent when readings only go up", () => {
    const r = checkMileage([
      { km: 50_000, at: "2025-01-10" },
      { km: 62_000, at: "2025-09-01" },
      { km: 55_000, at: "2025-04-01" },
    ])
    expect(r).toMatchObject({ status: "consistent", latestKm: 62_000, readings: 3 })
  })
  it("flags a drop beyond the tolerance", () => {
    const r = checkMileage([
      { km: 120_000, at: "2024-01-01" },
      { km: 80_000, at: "2025-01-01" },
      { km: 85_000, at: "2025-06-01" },
    ])
    expect(r).toMatchObject({ status: "dropped", droppedOn: "2025-01-01", fromKm: 120_000, toKm: 80_000 })
  })
  it("ignores small typing slips and replaced odometers", () => {
    expect(checkMileage([{ km: 60_000, at: "2025-01-01" }, { km: 59_800, at: "2025-02-01" }]).status).toBe("consistent")
    expect(checkMileage([{ km: 200_000, at: "2024-01-01" }, { km: 1_000, at: "2025-01-01", odometerReplaced: true }, { km: 9_000, at: "2025-06-01" }]).status).toBe("consistent")
  })
  it("handles no readings", () => {
    expect(checkMileage([]).status).toBe("none")
  })
})

describe("mileageTimeline", () => {
  it("keeps the last reading of each month", () => {
    expect(mileageTimeline([
      { km: 10, at: "2025-01-02" }, { km: 20, at: "2025-01-28" }, { km: 30, at: "2025-03-01" },
    ])).toEqual([{ month: "2025-01", km: 20 }, { month: "2025-03", km: 30 }])
  })
})

describe("summariseVisit", () => {
  it("lists approved labour and parts once, counts proof, skips declined and sundries", () => {
    const s = summariseVisit([
      { type: "part", description: "Brake pads (front)", approvalStatus: "approved", oldPartProof: "photo" },
      { type: "labour", description: "Replace front brake pads", approvalStatus: "approved", oldPartProof: null },
      { type: "part", description: "brake pads (front)", approvalStatus: "approved", oldPartProof: null },
      { type: "part", description: "Timing belt", approvalStatus: "declined", oldPartProof: null },
      { type: "sundry", description: "Shop supplies", approvalStatus: "approved", oldPartProof: null },
    ])
    expect(s.work).toEqual(["Brake pads (front)", "Replace front brake pads"])
    expect(s.partsWithProof).toBe(1)
  })
  it("strips phone numbers and e-mails", () => {
    expect(tidy("Call Kofi 024 123 4567 re: alternator")).toBe("Call Kofi re: alternator")
    expect(tidy("Send to kofi@example.com now")).toBe("Send to now")
  })
})

describe("paperStatuses", () => {
  it("keeps the latest expiry per paper, shows month only, drops driver's licence", () => {
    const r = paperStatuses([
      { kind: "insurance", expiry: "2026-03-01" },
      { kind: "insurance", expiry: "2027-03-01" },
      { kind: "roadworthy", expiry: "2026-01-15" },
      { kind: "drivers_licence", expiry: "2030-01-01" },
    ], "2026-11-23")
    expect(r).toEqual([
      { label: "Insurance", status: "valid", until: "2027-03" },
      { label: "Roadworthy certificate", status: "expired", until: "2026-01" },
    ])
  })
})
