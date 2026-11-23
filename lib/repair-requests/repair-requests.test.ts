import { describe, expect, it } from "vitest"
import { matchGarages, rulesTriage } from "./core"
import { triagePrompt } from "@/lib/ai/prompts"

describe("rulesTriage", () => {
  it("flags overheating as stop-driving engine work", () => {
    const t = rulesTriage("The car is overheating and steam comes from the bonnet")
    expect(t.urgency).toBe("stop_driving")
    expect(t.specialty).toBe("engine")
    expect(t.safetyNote).toBeTruthy()
    expect(t.likelyParts).toContain("Radiator")
  })
  it("uses warning lights to raise urgency", () => {
    expect(rulesTriage("weird noise", ["oil"]).urgency).toBe("stop_driving")
    expect(rulesTriage("nothing specific").urgency).toBe("can_wait")
  })
  it("matches translated brake complaints", () => {
    const t = rulesTriage("My car makes noise when I brake.")
    expect(t.specialty).toBe("brakes")
    expect(t.costRangeGhs.min).toBeLessThan(t.costRangeGhs.max)
  })
  it("satisfies the AI output schema so the mock is a valid triage", () => {
    expect(triagePrompt.output.safeParse(rulesTriage("grinding when braking")).success).toBe(true)
  })
})

describe("matchGarages", () => {
  const accra = { lat: 5.6037, lng: -0.187 }
  const garages = [
    { id: "near-general", gpsLat: 5.61, gpsLng: -0.19, region: "Greater Accra", city: "Accra", specialties: [], coverageMakes: [] },
    { id: "near-ac-only", gpsLat: 5.6, gpsLng: -0.18, region: "Greater Accra", city: "Accra", specialties: ["ac"], coverageMakes: [] },
    { id: "near-honda-only", gpsLat: 5.6, gpsLng: -0.18, region: "Greater Accra", city: "Accra", specialties: [], coverageMakes: ["honda"] },
    { id: "kumasi", gpsLat: 6.69, gpsLng: -1.62, region: "Ashanti", city: "Kumasi", specialties: [], coverageMakes: [] },
    { id: "no-gps-accra", gpsLat: null, gpsLng: null, region: "Greater Accra", city: "Tema", specialties: ["brakes"], coverageMakes: [] },
  ]
  it("filters by radius, specialty and make", () => {
    const r = matchGarages(garages, { ...accra, region: "Greater Accra", city: "Accra", radiusKm: 15, specialty: "brakes", make: "Toyota" })
    expect(r.map((x) => x.id).sort()).toEqual(["near-general", "no-gps-accra"])
    expect(r[0]!.distanceKm).not.toBeNull()
  })
  it("falls back to area when the driver shares no GPS", () => {
    const r = matchGarages(garages, { lat: null, lng: null, region: "Ashanti", city: null, radiusKm: 15, specialty: "general", make: null })
    expect(r.map((x) => x.id)).toEqual(["kumasi"])
  })
})
