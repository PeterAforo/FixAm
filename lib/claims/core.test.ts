import { describe, expect, it } from "vitest"
import { canTransition, claimReadyForSubmit, newClaimNumber, nextActor } from "./core"

describe("claim transitions", () => {
  it("driver can submit a draft", () => {
    expect(canTransition("draft", "submitted", "driver")).toBe(true)
    expect(canTransition("draft", "submitted", "broker")).toBe(false)
  })

  it("broker assesses then approves / partly approves / rejects", () => {
    expect(canTransition("submitted", "assessing", "broker")).toBe(true)
    expect(canTransition("assessing", "approved", "broker")).toBe(true)
    expect(canTransition("assessing", "partially_approved", "broker")).toBe(true)
    expect(canTransition("assessing", "rejected", "broker")).toBe(true)
    expect(canTransition("submitted", "approved", "broker")).toBe(false)
  })

  it("approved or partly approved claims can be repair-authorised by anyone involved", () => {
    expect(canTransition("approved", "repair_authorised", "garage")).toBe(true)
    expect(canTransition("partially_approved", "repair_authorised", "driver")).toBe(true)
    expect(canTransition("submitted", "repair_authorised", "garage")).toBe(false)
  })

  it("terminal states accept nothing", () => {
    expect(canTransition("rejected", "submitted", "driver")).toBe(false)
    expect(canTransition("settled", "repair_authorised", "any")).toBe(false)
  })
})

describe("nextActor", () => {
  it("routes the ball correctly", () => {
    expect(nextActor("draft")).toBe("broker")
    expect(nextActor("submitted")).toBe("broker")
    expect(nextActor("assessing")).toBe("broker")
    expect(nextActor("approved")).toBe("garage")
    expect(nextActor("partially_approved")).toBe("garage")
    expect(nextActor("repair_authorised")).toBe("system")
    expect(nextActor("settled")).toBeNull()
    expect(nextActor("rejected")).toBeNull()
  })
})

describe("claimReadyForSubmit", () => {
  it("requires time, a photo and the injuries answer", () => {
    expect(claimReadyForSubmit({ occurredAt: true, photos: 1, injuries: false, otherParty: false }).ok).toBe(true)
    const r = claimReadyForSubmit({ occurredAt: false, photos: 0, injuries: null, otherParty: false })
    expect(r.ok).toBe(false)
    expect(r.missing).toHaveLength(3)
  })
})

describe("newClaimNumber", () => {
  it("formats CLM-000001", () => {
    expect(newClaimNumber(1)).toBe("CLM-000001")
    expect(newClaimNumber("42")).toBe("CLM-000042")
  })
})
