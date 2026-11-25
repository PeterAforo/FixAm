import { describe, expect, it } from "vitest"
import { reminderDetail, reminderStage } from "./trial-schedule"

const DAY = 86_400_000
const now = new Date("2026-12-01T03:00:00Z")
const at = (days: number) => new Date(now.getTime() + days * DAY)

describe("reminderStage", () => {
  it("fires each stage on exactly one daily run", () => {
    expect(reminderStage("trialing", at(7), now)).toBe("midway")
    expect(reminderStage("trialing", at(6.5), now)).toBe("midway")
    expect(reminderStage("trialing", at(6), now)).toBe(null)
    expect(reminderStage("trialing", at(2), now)).toBe("ending")
    expect(reminderStage("trialing", at(0.4), now)).toBe("last_day")
    expect(reminderStage("past_due", at(-0.2), now)).toBe("ended")
    expect(reminderStage("past_due", at(-1.5), now)).toBe(null)
    expect(reminderStage("past_due", at(-5.3), now)).toBe("grace_last")
    expect(reminderStage("past_due", at(-8), now)).toBe(null)
  })
  it("ignores missing trial dates and active subscriptions", () => {
    expect(reminderStage("trialing", null, now)).toBe(null)
    expect(reminderStage("active", at(-0.2), now)).toBe(null)
  })
  it("writes plain reminder lines", () => {
    expect(reminderDetail("midway", "Growth", 349, "23 jobs and GH₵4,860 collected")).toContain("23 jobs")
    expect(reminderDetail("ended", "Growth", 349)).toContain("7 days")
  })
})
