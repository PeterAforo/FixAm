import { describe, expect, it } from "vitest"
import { clearAccepted, decodeDtc, decodePid, isNoData, messages, parseDtcs, parseFreezeFrameDtc, parseMonitorStatus, parseProtocol, parseVin, parseVoltage, pidBytes } from "./protocol"

describe("decodeDtc", () => {
  it("decodes the letter and digits", () => {
    expect(decodeDtc(0x01, 0x33)).toBe("P0133")
    expect(decodeDtc(0x03, 0x00)).toBe("P0300")
    expect(decodeDtc(0x24, 0x20)).toBe("P2420")
    expect(decodeDtc(0x41, 0x23)).toBe("C0123")
    expect(decodeDtc(0x81, 0x00)).toBe("B0100")
    expect(decodeDtc(0xc1, 0x00)).toBe("U0100")
    expect(decodeDtc(0x0a, 0x0f)).toBe("P0A0F")
    expect(decodeDtc(0, 0)).toBeNull()
  })
})

describe("parseDtcs", () => {
  it("reads a CAN single-frame reply with a count byte", () => {
    expect(parseDtcs("43020133030 1\r\r>".replace(" ", ""), "03")).toEqual([
      { code: "P0133", kind: "stored" },
      { code: "P0301", kind: "stored" },
    ])
  })
  it("reads spaced output and several ECUs", () => {
    expect(parseDtcs("43 01 01 71\r43 01 07 00\r\r>", "03").map((d) => d.code)).toEqual(["P0171", "P0700"])
  })
  it("reads a CAN multi-frame reply", () => {
    const raw = "00B\r0:4304013301\r1:71030004200000\r\r>"
    expect(parseDtcs(raw, "03").map((d) => d.code)).toEqual(["P0133", "P0171", "P0300", "P0420"])
  })
  it("reads K-line frames padded with zeros", () => {
    const raw = "43 01 33 01 71 00 00\r\n>"
    expect(parseDtcs(raw, "03").map((d) => d.code)).toEqual(["P0133", "P0171"])
  })
  it("labels pending and permanent codes", () => {
    expect(parseDtcs("4701 0420", "07")).toEqual([{ code: "P0420", kind: "pending" }])
    expect(parseDtcs("4A010420", "0A")).toEqual([{ code: "P0420", kind: "permanent" }])
  })
  it("returns nothing when there are no codes", () => {
    expect(parseDtcs("4300\r>", "03")).toEqual([])
    expect(parseDtcs("NO DATA\r>", "03")).toEqual([])
    expect(isNoData("SEARCHING...\rUNABLE TO CONNECT\r>")).toBe(true)
  })
})

describe("parseVin", () => {
  it("reads a CAN multi-frame VIN", () => {
    const raw = "014\r0:490201314734\r1:4A433534343452\r2:37323532333637\r\r>"
    expect(parseVin(raw)).toBe("1G4JC5444R7252367")
  })
  it("reads K-line VIN frames", () => {
    const raw = [
      "49 02 01 00 00 00 31", "49 02 02 47 34 4A 43", "49 02 03 35 34 34 34",
      "49 02 04 52 37 32 35", "49 02 05 32 33 36 37",
    ].join("\r")
    expect(parseVin(raw)).toBe("1G4JC5444R7252367")
  })
  it("returns null when the car doesn't report a VIN", () => {
    expect(parseVin("NO DATA")).toBeNull()
  })
})

describe("live data", () => {
  it("decodes RPM, coolant, speed and load", () => {
    expect(decodePid("0C", pidBytes("410C1AF8", "01", "0C")!)).toBe(1726)
    expect(decodePid("05", pidBytes("41 05 7B", "01", "05")!)).toBe(83)
    expect(decodePid("0D", pidBytes("410D32", "01", "0D")!)).toBe(50)
    expect(decodePid("04", pidBytes("4104FF", "01", "04")!)).toBe(100)
  })
  it("reads the warning light and code count", () => {
    expect(parseMonitorStatus("4101830765E5")).toEqual({ milOn: true, dtcCount: 3 })
    expect(parseMonitorStatus("410100076500")).toEqual({ milOn: false, dtcCount: 0 })
  })
  it("reads battery voltage, freeze-frame code and protocol", () => {
    expect(parseVoltage("12.6V\r>")).toBe(12.6)
    expect(parseFreezeFrameDtc("42020001 33")).toBe("P0133")
    expect(decodePid("0C", pidBytes("420C000FA0", "02", "0C")!)).toBe(1000)
    expect(parseProtocol("A6")).toEqual({ number: "6", isCan: true })
    expect(parseProtocol("3")).toEqual({ number: "3", isCan: false })
  })
  it("accepts a clear-codes reply", () => {
    expect(clearAccepted("44\r>")).toBe(true)
    expect(clearAccepted("NO DATA")).toBe(false)
  })
  it("drops searching noise", () => {
    expect(messages("SEARCHING...\r410C1AF8\r\r>")).toEqual(["410C1AF8"])
  })
})
