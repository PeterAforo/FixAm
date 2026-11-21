import { describe, expect, it } from "vitest"
import {
  REMINDER_RULES,
  allowedChannels,
  batchBucket,
  channelOrder,
  daysUntil,
  effectiveDueDate,
  escalationFor,
  type DueItemType,
} from "./reminders"

const today = new Date("2026-03-01T12:00:00Z")
const iso = (offsetDays: number) => {
  const d = new Date(today.getTime() + offsetDays * 86400_000)
  return d.toISOString().slice(0, 10)
}

describe("effectiveDueDate", () => {
  it("takes the earliest of dueDate and predictedDueDate", () => {
    expect(effectiveDueDate({ dueDate: "2026-04-01", predictedDueDate: "2026-03-15" })).toBe("2026-03-15")
    expect(effectiveDueDate({ dueDate: "2026-03-15", predictedDueDate: "2026-04-01" })).toBe("2026-03-15")
    expect(effectiveDueDate({ dueDate: null, predictedDueDate: "2026-04-01" })).toBe("2026-04-01")
    expect(effectiveDueDate({})).toBeNull()
  })
})

describe("daysUntil", () => {
  it("computes signed day distance", () => {
    expect(daysUntil(iso(10), today)).toBe(10)
    expect(daysUntil(iso(-5), today)).toBe(-5)
    expect(daysUntil(iso(0), today)).toBe(0)
  })
})

describe("escalationFor — every due_item_type", () => {
  const types = Object.keys(REMINDER_RULES) as DueItemType[]

  it("covers all nine types", () => {
    expect(types).toHaveLength(9)
  })

  for (const type of types) {
    const rule = REMINDER_RULES[type]
    it(`${type}: fires first reminder at the largest escalation threshold`, () => {
      const maxT = Math.max(...rule.escalationDaysBefore)
      const eff = iso(maxT + 1)
      const r = escalationFor(type, eff, today)!
      expect(r.status).toBe("scheduled")
      expect(r.stage).toBe(0)
      expect(r.nextReminderAt).not.toBeNull()
    })

    it(`${type}: reaches due_soon inside the window and due on the day`, () => {
      const mid = Math.floor(Math.max(...rule.escalationDaysBefore) / 2)
      const r1 = escalationFor(type, iso(mid), today)!
      expect(["due_soon", "due"]).toContain(r1.status)
      expect(r1.stage).toBeGreaterThan(0)
      const r0 = escalationFor(type, iso(0), today)!
      expect(r0.status).toBe("due")
    })

    it(`${type}: goes overdue after the effective date`, () => {
      const r = escalationFor(type, iso(-1), today)!
      expect(r.status).toBe("overdue")
      const r2 = escalationFor(type, iso(-(Math.max(...rule.overdueDaysAfter) + 1)), today)!
      expect(r2.status).toBe("overdue")
      expect(r2.stage).toBeGreaterThanOrEqual(r.stage)
    })

    it(`${type}: template keys come from the rule`, () => {
      const r = escalationFor(type, iso(-2), today)!
      expect(r.templateKey).toBe(rule.templates.overdue)
      expect(r.primaryAction).toBe(rule.primaryAction)
    })
  }

  it("oil_change: 10 days out → stage 1 of 3 (14d threshold only)", () => {
    const r = escalationFor("oil_change", iso(10), today)!
    expect(r.status).toBe("due_soon")
    expect(r.stage).toBe(1)
    expect(r.templateKey).toBe("oil_due_soon")
  })

  it("oil_change: 5 days out → stage 2", () => {
    expect(escalationFor("oil_change", iso(5), today)!.stage).toBe(2)
  })

  it("oil_change: overdue by 20 days → past both overdue thresholds", () => {
    const r = escalationFor("oil_change", iso(-20), today)!
    expect(r.status).toBe("overdue")
    expect(r.stage).toBe(3 + 2)
  })

  it("returns null without an effective date", () => {
    expect(escalationFor("oil_change", null, today)).toBeNull()
  })
})

describe("batching", () => {
  it("groups due dates in the same 7-day window", () => {
    // anchored at Mar 1: Mar 4/6 share the 0..7d bucket, Mar 11 is in the next
    const now = "2026-03-01"
    expect(batchBucket("2026-03-04", now)).toBe(batchBucket("2026-03-06", now))
    expect(batchBucket("2026-03-04", now)).not.toBe(batchBucket("2026-03-11", now))
    // same calendar week, different rolling window
    expect(batchBucket("2026-03-04", "2026-03-05")).not.toBe(batchBucket("2026-03-11", "2026-03-05"))
  })
})

describe("channel routing", () => {
  it("defaults to whatsapp, sms, push, email", () => {
    expect(channelOrder(null)).toEqual(["whatsapp", "sms", "push", "email"])
  })
  it("honours customer preferred order", () => {
    expect(channelOrder(["sms", "whatsapp"])).toEqual(["sms", "whatsapp", "push", "email"])
  })
  it("over allowance suppresses paid channels only", () => {
    expect(allowedChannels(["whatsapp", "sms", "push", "email"], true)).toEqual(["push", "email"])
    expect(allowedChannels(["whatsapp", "sms", "push", "email"], false)).toHaveLength(4)
  })
})
