import { describe, expect, it } from "vitest"
import { normalizeWaPhone, parseCloudApiMessages, phoneNumberIdOf, withinServiceWindow, parsePendingGarage } from "./core"

describe("normalizeWaPhone", () => {
  it("strips formatting and keeps digits", () => {
    expect(normalizeWaPhone("+233 24 123 4567")).toBe("233241234567")
    expect(normalizeWaPhone("00233241234567")).toBe("233241234567")
  })
  it("rejects junk", () => {
    expect(normalizeWaPhone("abc")).toBeNull()
    expect(normalizeWaPhone("123")).toBeNull()
  })
})

describe("withinServiceWindow", () => {
  const now = new Date("2025-01-02T12:00:00Z")
  it("true inside 24 h, false outside or never", () => {
    expect(withinServiceWindow(new Date("2025-01-02T00:00:00Z"), now)).toBe(true)
    expect(withinServiceWindow(new Date("2025-01-01T11:00:00Z"), now)).toBe(false)
    expect(withinServiceWindow(null, now)).toBe(false)
  })
})

describe("parseCloudApiMessages", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "123" },
          messages: [
            { id: "wamid.1", from: "233241234567", timestamp: "1735689600", type: "text", text: { body: "is my car ready?" } },
            { id: "wamid.2", from: "233241234567", timestamp: "1735689601", type: "audio", audio: { id: "media1", mime_type: "audio/ogg" } },
            { id: "wamid.3", from: "bad", timestamp: "1735689602", type: "text", text: { body: "x" } },
          ],
        },
      }],
    }],
  }
  it("parses text + audio, skips bad senders", () => {
    const msgs = parseCloudApiMessages(payload)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ wamid: "wamid.1", from: "233241234567", type: "text", text: "is my car ready?" })
    expect(msgs[1]).toMatchObject({ type: "audio", mediaId: "media1", mediaMime: "audio/ogg" })
  })
  it("ignores non-message payloads", () => {
    expect(parseCloudApiMessages({ object: "whatsapp_business_account", entry: [] })).toEqual([])
    expect(parseCloudApiMessages({ hello: 1 })).toEqual([])
  })
  it("reads phone_number_id", () => {
    expect(phoneNumberIdOf(payload)).toBe("123")
  })
})

describe("parsePendingGarage", () => {
  it("round-trips and rejects junk", () => {
    const p = { options: [{ id: "a", name: "Garage A" }], askedAt: new Date().toISOString() }
    expect(parsePendingGarage(p)).toEqual(p)
    expect(parsePendingGarage({ options: [] })).toBeNull()
    expect(parsePendingGarage(null)).toBeNull()
  })
})
