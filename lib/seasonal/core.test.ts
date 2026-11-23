import { describe, expect, it } from "vitest"
import { checklistLine, earliestStart, eligible, plannedCampaigns, seasonalChannel, upcomingSendDays, windowClosed, windowOpen, zoneFor } from "./core"

describe("zoneFor", () => {
  it("maps Ghana regions to weather zones", () => {
    expect(zoneFor("Upper East Region")).toBe("north")
    expect(zoneFor("North-East")).toBe("north")
    expect(zoneFor("Savannah")).toBe("north")
    expect(zoneFor("Ashanti")).toBe("middle")
    expect(zoneFor("Brong-Ahafo")).toBe("middle")
    expect(zoneFor("Greater Accra")).toBe("coast")
    expect(zoneFor("Western North")).toBe("coast")
    expect(zoneFor(null)).toBe("coast")
    expect(zoneFor("Somewhere")).toBe("coast")
  })
})

describe("plannedCampaigns", () => {
  it("creates harmattan a week before the coast send day", () => {
    expect(plannedCampaigns("coast", "2026-11-27")).toEqual([])
    expect(plannedCampaigns("coast", "2026-11-28")).toEqual([{ season: "harmattan", sendOn: "2026-12-05", zone: "coast" }])
    expect(plannedCampaigns("coast", "2026-12-19")).toEqual([{ season: "harmattan", sendOn: "2026-12-05", zone: "coast" }])
    expect(plannedCampaigns("coast", "2026-12-20")).toEqual([])
  })
  it("north has no minor rains", () => {
    expect(plannedCampaigns("north", "2026-09-05")).toEqual([])
    expect(plannedCampaigns("middle", "2026-09-05").map((c) => c.season)).toEqual(["rainy_minor"])
  })
  it("next send days roll into next year once a window has passed", () => {
    const u = upcomingSendDays("north", "2026-11-23")
    expect(u[0]).toEqual({ season: "harmattan", sendOn: "2026-11-15", zone: "north" })
    expect(u.map((x) => x.sendOn)).toContain("2027-04-25")
  })
})

describe("windows", () => {
  it("opens on the send day and closes 14 days later", () => {
    expect(windowOpen("2026-12-05", "2026-12-04")).toBe(false)
    expect(windowOpen("2026-12-05", "2026-12-05")).toBe(true)
    expect(windowOpen("2026-12-05", "2026-12-19")).toBe(true)
    expect(windowClosed("2026-12-05", "2026-12-20")).toBe(true)
  })
})

describe("eligible", () => {
  const base = { seasonalOptOut: false, deleted: false, lastServiceAt: "2026-06-01", lastSeasonalAt: null, todayISO: "2026-12-05" }
  it("accepts recent customers", () => expect(eligible(base)).toEqual({ ok: true }))
  it("respects opt-out", () => expect(eligible({ ...base, seasonalOptOut: true })).toEqual({ ok: false, reason: "opted_out" }))
  it("skips customers not seen in 18 months", () => expect(eligible({ ...base, lastServiceAt: "2024-12-01" })).toEqual({ ok: false, reason: "inactive" }))
  it("skips customers messaged in the last 45 days", () => expect(eligible({ ...base, lastSeasonalAt: "2026-11-01" })).toEqual({ ok: false, reason: "recently_messaged" }))
})

describe("channel and copy", () => {
  it("uses WhatsApp only when allowed and preferred", () => {
    expect(seasonalChannel({ whatsappOptIn: true, preferredChannels: ["whatsapp", "sms"] })).toBe("whatsapp")
    expect(seasonalChannel({ whatsappOptIn: false, preferredChannels: ["whatsapp", "sms"] })).toBe("sms")
    expect(seasonalChannel({ whatsappOptIn: true, preferredChannels: ["sms", "whatsapp"] })).toBe("sms")
  })
  it("builds a short checklist line", () => {
    expect(checklistLine("harmattan")).toBe("air & AC filters, wipers, lights and coolant")
    expect(checklistLine("rainy_minor")).toBe("wipers, tyres, brakes and lights")
  })
})

describe("earliestStart", () => {
  it("waits 48h after a late campaign is created", () => {
    expect(earliestStart("2026-11-15", new Date("2026-11-23T06:30:00Z")).toISOString()).toBe("2026-11-25T06:30:00.000Z")
  })
  it("uses the send day when created a week ahead", () => {
    expect(earliestStart("2026-12-05", new Date("2026-11-28T06:30:00Z")).toISOString()).toBe("2026-12-05T00:00:00.000Z")
  })
})
