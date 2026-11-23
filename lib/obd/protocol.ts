/**
 * ELM327 / OBD-II response parsing (P8-13) — pure, no browser APIs.
 *
 * Works with the adapter set to echo off, linefeeds off, spaces off and
 * headers off (ATE0 ATL0 ATS0 ATH0), but tolerates spaces too. Handles
 * single-frame and ISO-TP multi-frame CAN replies ("0:", "1:" lines) and
 * older K-line/J1850 replies (one line per frame), from one or more ECUs.
 */

export type DtcKind = "stored" | "pending" | "permanent"
export type Dtc = { code: string; kind: DtcKind }

const NOISE = /^(SEARCHING\.*|BUS INIT:?\s*(OK|\.\.\.)?|OK|STOPPED|\?|ELM327.*|>)$/i

/** Splits raw adapter output into messages (hex strings, upper case, no spaces). */
export function messages(raw: string): string[] {
  const lines = raw
    .replace(/>/g, "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !NOISE.test(l))
  const out: string[] = []
  let multi: string | null = null
  for (const line of lines) {
    const compact = line.replace(/\s+/g, "").toUpperCase()
    const frame = /^([0-9A-F]):([0-9A-F]+)$/.exec(compact)
    if (/^[0-9A-F]{3}$/.test(compact)) {
      // ISO-TP byte-count line → a multi-frame message follows
      if (multi) out.push(multi)
      multi = ""
      continue
    }
    if (frame) {
      if (multi === null) multi = ""
      if (frame[1] === "0" && multi) { out.push(multi); multi = "" }
      multi += frame[2]
      continue
    }
    if (multi) { out.push(multi); multi = null }
    if (/^[0-9A-F]+$/.test(compact) && compact.length % 2 === 0) out.push(compact)
  }
  if (multi) out.push(multi)
  return out
}

export function isNoData(raw: string): boolean {
  return /NO DATA|UNABLE TO CONNECT|CAN ERROR|BUS ERROR|BUFFER FULL|STOPPED|ERROR/i.test(raw) && messages(raw).length === 0
}

const bytes = (hex: string) => (hex.match(/../g) ?? []).map((b) => parseInt(b, 16))

const LETTERS = ["P", "C", "B", "U"] as const

/** Two bytes → "P0133". Returns null for padding (0000). */
export function decodeDtc(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null
  const letter = LETTERS[(a >> 6) & 0x3]
  const d2 = (a >> 4) & 0x3
  const d3 = (a & 0xf).toString(16).toUpperCase()
  const rest = b.toString(16).toUpperCase().padStart(2, "0")
  return `${letter}${d2}${d3}${rest}`
}

const KIND_BY_MODE: Record<string, DtcKind> = { "43": "stored", "47": "pending", "4A": "permanent" }

/**
 * Mode 03 / 07 / 0A reply → codes. CAN replies carry a count byte first
 * (odd number of bytes after the mode byte); older protocols send three
 * pairs per frame, padded with 0000.
 */
export function parseDtcs(raw: string, mode: "03" | "07" | "0A"): Dtc[] {
  const resp = (parseInt(mode, 16) + 0x40).toString(16).toUpperCase()
  const kind = KIND_BY_MODE[resp]
  const seen = new Set<string>()
  const out: Dtc[] = []
  for (const m of messages(raw)) {
    if (!m.startsWith(resp)) continue
    let data = bytes(m.slice(2))
    if (data.length % 2 === 1) {
      const n = data[0]
      data = data.slice(1, 1 + n * 2)
    }
    for (let i = 0; i + 1 < data.length; i += 2) {
      const code = decodeDtc(data[i], data[i + 1])
      if (code && !seen.has(code)) { seen.add(code); out.push({ code, kind }) }
    }
  }
  return out
}

/** Mode 09 PID 02 reply → 17-character VIN, or null. */
export function parseVin(raw: string): string | null {
  let ascii = ""
  for (const m of messages(raw)) {
    if (!m.startsWith("4902")) continue
    const data = bytes(m.slice(4))
    // CAN: one message — item count (01) then 17 chars.
    // K-line: several messages — sequence number then 4 bytes.
    // Either way the first byte is not part of the VIN.
    const chars = data.slice(1)
    ascii += String.fromCharCode(...chars.filter((c) => c >= 0x20 && c < 0x7f))
  }
  const clean = ascii.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase()
  return clean.length >= 17 ? clean.slice(-17) : null
}

/** First reply data bytes for a mode 01/02 PID ("410C1AF8" → [0x1A, 0xF8]). */
export function pidBytes(raw: string, mode: "01" | "02", pid: string): number[] | null {
  const resp = (parseInt(mode, 16) + 0x40).toString(16).toUpperCase() + pid.toUpperCase()
  for (const m of messages(raw)) {
    if (!m.startsWith(resp)) continue
    const data = bytes(m.slice(resp.length))
    return mode === "02" ? data.slice(1) : data // mode 02 has a frame-number byte
  }
  return null
}

export type LiveData = { rpm?: number; coolantC?: number; speedKmh?: number; loadPct?: number; voltage?: number }

export const LIVE_PIDS = { rpm: "0C", coolantC: "05", speedKmh: "0D", loadPct: "04" } as const

export function decodePid(pid: string, b: number[]): number | null {
  switch (pid.toUpperCase()) {
    case "0C": return b.length >= 2 ? Math.round((b[0] * 256 + b[1]) / 4) : null
    case "05": return b.length >= 1 ? b[0] - 40 : null
    case "0D": return b.length >= 1 ? b[0] : null
    case "04": return b.length >= 1 ? Math.round((b[0] * 100) / 255) : null
    default: return null
  }
}

/** Mode 01 PID 01 → warning light on? and how many stored codes. */
export function parseMonitorStatus(raw: string): { milOn: boolean; dtcCount: number } | null {
  const b = pidBytes(raw, "01", "01")
  if (!b || !b.length) return null
  return { milOn: (b[0] & 0x80) !== 0, dtcCount: b[0] & 0x7f }
}

/** "ATRV" → 12.6 */
export function parseVoltage(raw: string): number | null {
  const m = /(\d{1,2}(?:\.\d)?)\s*V/i.exec(raw)
  return m ? Number(m[1]) : null
}

/** Mode 02 PID 02 → the code that stored the freeze frame. */
export function parseFreezeFrameDtc(raw: string): string | null {
  const b = pidBytes(raw, "02", "02")
  return b && b.length >= 2 ? decodeDtc(b[0], b[1]) : null
}

/** "ATDPN" → protocol number; "A6" (auto, 6) → 6. CAN is 6–9 (and A–C on some clones). */
export function parseProtocol(raw: string): { number: string; isCan: boolean } | null {
  const m = /A?([0-9A-C])\s*$/i.exec(raw.replace(/>/g, "").trim())
  if (!m) return null
  const n = m[1].toUpperCase()
  return { number: n, isCan: ["6", "7", "8", "9", "A", "B", "C"].includes(n) }
}

/** Mode 04 reply: "44" means the ECU accepted the clear. */
export function clearAccepted(raw: string): boolean {
  return messages(raw).some((m) => m.startsWith("44"))
}
