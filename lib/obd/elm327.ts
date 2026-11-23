/**
 * ELM327 session (P8-13): sends AT/OBD commands over any transport (Web
 * Bluetooth in the browser, a fake in tests) and returns parsed results.
 */
import {
  LIVE_PIDS,
  clearAccepted,
  decodePid,
  isNoData,
  parseDtcs,
  parseFreezeFrameDtc,
  parseMonitorStatus,
  parseProtocol,
  parseVin,
  parseVoltage,
  pidBytes,
  type Dtc,
  type LiveData,
} from "./protocol"

export interface ObdTransport {
  /** Sends one command (without \r) and resolves with everything up to the ">" prompt. */
  send(command: string, timeoutMs?: number): Promise<string>
  close(): Promise<void>
}

export type FreezeFrame = { dtc: string | null; rpm?: number; coolantC?: number; speedKmh?: number; loadPct?: number }

export type ScanResult = {
  vin: string | null
  protocol: string | null
  milOn: boolean | null
  dtcs: Dtc[]
  freezeFrame: FreezeFrame | null
  live: LiveData
}

export class ObdError extends Error {
  constructor(public code: "NO_ADAPTER_REPLY" | "NO_CAR" | "TIMEOUT", message: string) {
    super(message)
  }
}

export async function initAdapter(t: ObdTransport, log: (s: string) => void = () => {}): Promise<{ protocol: string | null }> {
  const reset = await t.send("ATZ", 4000).catch(() => "")
  if (!/ELM|OBD|v\d/i.test(reset)) {
    // Some clones don't echo a banner after ATZ; check they answer at all.
    const id = await t.send("ATI", 2000).catch(() => "")
    if (!id.trim()) throw new ObdError("NO_ADAPTER_REPLY", "The adapter isn't answering. Unplug it, plug it back in and try again.")
  }
  for (const c of ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await t.send(c, 2000).catch(() => "")
  log("Looking for the car…")
  const probe = await t.send("0100", 15000)
  if (isNoData(probe)) throw new ObdError("NO_CAR", "Couldn't talk to the car. Turn the ignition ON (engine can be off) and check the adapter is pushed fully into the port.")
  const dp = await t.send("ATDPN", 2000).catch(() => "")
  const p = parseProtocol(dp)
  return { protocol: p?.number ?? null }
}

export async function readLive(t: ObdTransport): Promise<LiveData> {
  const out: LiveData = {}
  for (const [key, pid] of Object.entries(LIVE_PIDS) as [keyof typeof LIVE_PIDS, string][]) {
    const raw = await t.send(`01${pid}`, 3000).catch(() => "")
    const b = pidBytes(raw, "01", pid)
    const v = b ? decodePid(pid, b) : null
    if (v != null) out[key] = v
  }
  const v = parseVoltage(await t.send("ATRV", 2000).catch(() => ""))
  if (v != null) out.voltage = v
  return out
}

export async function readFreezeFrame(t: ObdTransport): Promise<FreezeFrame | null> {
  const dtc = parseFreezeFrameDtc(await t.send("020200", 4000).catch(() => ""))
  if (!dtc) return null
  const ff: FreezeFrame = { dtc }
  for (const [key, pid] of Object.entries(LIVE_PIDS) as [keyof typeof LIVE_PIDS, string][]) {
    const b = pidBytes(await t.send(`02${pid}00`, 3000).catch(() => ""), "02", pid)
    const v = b ? decodePid(pid, b) : null
    if (v != null) ff[key] = v
  }
  return ff
}

/** Full read: VIN, warning light, stored/pending/permanent codes, freeze frame, live data. */
export async function fullScan(t: ObdTransport, log: (s: string) => void = () => {}): Promise<ScanResult> {
  const { protocol } = await initAdapter(t, log)
  log("Reading the VIN…")
  const vin = parseVin(await t.send("0902", 6000).catch(() => ""))
  const mon = parseMonitorStatus(await t.send("0101", 4000).catch(() => ""))
  log("Reading fault codes…")
  const dtcs: Dtc[] = []
  for (const mode of ["03", "07", "0A"] as const) {
    const raw = await t.send(mode, 6000).catch(() => "")
    for (const d of parseDtcs(raw, mode)) if (!dtcs.some((x) => x.code === d.code)) dtcs.push(d)
  }
  const freezeFrame = dtcs.length ? await readFreezeFrame(t) : null
  log("Reading live data…")
  const live = await readLive(t)
  return { vin, protocol, milOn: mon?.milOn ?? null, dtcs, freezeFrame, live }
}

/** Mode 04. Only call after the server has authorised and audited the clear. */
export async function clearCodes(t: ObdTransport): Promise<boolean> {
  return clearAccepted(await t.send("04", 8000).catch(() => ""))
}
