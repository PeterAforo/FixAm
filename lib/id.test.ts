import { describe, expect, it } from "vitest"
import { isUuidV7, uuidv7 } from "./id"

describe("uuidv7", () => {
  it("produces valid v7 uuids", () => {
    const id = uuidv7()
    expect(isUuidV7(id)).toBe(true)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("is time-ordered", () => {
    const a = uuidv7(1000)
    const b = uuidv7(2000)
    const c = uuidv7(1500)
    expect(a < b).toBe(true)
    expect(c < b).toBe(true)
    expect(a < c).toBe(true)
  })

  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuidv7()))
    expect(ids.size).toBe(500)
  })
})
