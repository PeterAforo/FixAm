import { describe, expect, it } from "vitest"
import { clearCodes, fullScan, ObdError, type ObdTransport } from "./elm327"

function fake(replies: Record<string, string>): ObdTransport & { sent: string[] } {
  const sent: string[] = []
  return {
    sent,
    async send(cmd) { sent.push(cmd); return (replies[cmd] ?? "NO DATA") + "\r\r>" },
    async close() {},
  }
}

describe("fullScan", () => {
  it("reads VIN, codes, freeze frame and live data from a CAN car", async () => {
    const t = fake({
      ATZ: "ELM327 v1.5", "0100": "4100BE3FA813", ATDPN: "A6",
      "0902": "014\r0:490201314734\r1:4A433534343452\r2:37323532333637",
      "0101": "4101820765E5",
      "03": "43020133 0301".replace(" ", ""), "07": "4701 0420".replace(" ", ""), "0A": "4A00",
      "020200": "42020001 33".replace(" ", ""), "020C00": "420C000FA0", "020500": "42050078",
      "010C": "410C0BB8", "0105": "41057B", "010D": "410D00", "0104": "41044D", ATRV: "14.2V",
    })
    const r = await fullScan(t)
    expect(r.vin).toBe("1G4JC5444R7252367")
    expect(r.protocol).toBe("6")
    expect(r.milOn).toBe(true)
    expect(r.dtcs).toEqual([
      { code: "P0133", kind: "stored" }, { code: "P0301", kind: "stored" }, { code: "P0420", kind: "pending" },
    ])
    expect(r.freezeFrame).toEqual({ dtc: "P0133", rpm: 1000, coolantC: 80 })
    expect(r.live).toEqual({ rpm: 750, coolantC: 83, speedKmh: 0, loadPct: 30, voltage: 14.2 })
    expect(t.sent.slice(0, 7)).toEqual(["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"])
  })

  it("explains when the ignition is off", async () => {
    const t = fake({ ATZ: "ELM327 v2.1", "0100": "SEARCHING...\rUNABLE TO CONNECT" })
    await expect(fullScan(t)).rejects.toBeInstanceOf(ObdError)
  })

  it("never sends the clear command during a scan", async () => {
    const t = fake({ ATZ: "ELM327", "0100": "4100BE3FA813" })
    await fullScan(t)
    expect(t.sent).not.toContain("04")
  })
})

describe("clearCodes", () => {
  it("is true when the car acknowledges", async () => {
    expect(await clearCodes(fake({ "04": "44" }))).toBe(true)
    expect(await clearCodes(fake({}))).toBe(false)
  })
})
