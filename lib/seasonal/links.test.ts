import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { optOutToken, readOptOutToken } from "./links"

describe("opt-out links", () => {
  const id = "0192f3a4-5b6c-7d8e-9f01-23456789abcd"
  it("round-trips a customer id", () => {
    const t = optOutToken(id)
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    expect(readOptOutToken(t)).toBe(id)
  })
  it("rejects a tampered token", () => {
    const t = optOutToken(id)
    const other = optOutToken("11111111-2222-3333-4444-555555555555")
    expect(readOptOutToken(`${t.split(".")[0]}.${other.split(".")[1]}`)).toBeNull()
    expect(readOptOutToken("nonsense")).toBeNull()
  })
})
