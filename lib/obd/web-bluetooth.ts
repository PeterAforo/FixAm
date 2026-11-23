/**
 * Web Bluetooth transport for BLE ELM327 adapters (P8-13). Browser only.
 *
 * Works in Chrome on Android (and desktop Chrome/Edge). iPhones don't allow
 * Web Bluetooth in any browser, so iOS users are asked to use an Android
 * phone until there is a native app. Classic-Bluetooth-only (non-BLE)
 * adapters can't be reached from a browser either.
 */
import type { ObdTransport } from "./elm327"

/** GATT layouts used by common BLE OBD adapters (Vgate, Veepeak, Konnwei, generic clones). */
const PROFILES: { service: string; notify: string; write: string }[] = [
  { service: "0000fff0-0000-1000-8000-00805f9b34fb", notify: "0000fff1-0000-1000-8000-00805f9b34fb", write: "0000fff2-0000-1000-8000-00805f9b34fb" },
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", notify: "0000ffe1-0000-1000-8000-00805f9b34fb", write: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", notify: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", write: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
  { service: "000018f0-0000-1000-8000-00805f9b34fb", notify: "00002af0-0000-1000-8000-00805f9b34fb", write: "00002af1-0000-1000-8000-00805f9b34fb" },
]

// Minimal Web Bluetooth typings (not in TypeScript's DOM lib).
type Characteristic = EventTarget & {
  value?: DataView
  properties: { write: boolean; writeWithoutResponse: boolean; notify: boolean }
  startNotifications(): Promise<Characteristic>
  writeValue(v: BufferSource): Promise<void>
  writeValueWithoutResponse?(v: BufferSource): Promise<void>
}
type Service = { getCharacteristic(uuid: string): Promise<Characteristic> }
type Server = { connected: boolean; connect(): Promise<Server>; disconnect(): void; getPrimaryService(uuid: string): Promise<Service> }
type Device = EventTarget & { name?: string; gatt?: Server }
type Bluetooth = { requestDevice(o: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<Device>; getAvailability?(): Promise<boolean> }

export type BluetoothSupport = { ok: true } | { ok: false; reason: "ios" | "no_bluetooth" | "insecure" }

export function bluetoothSupport(): BluetoothSupport {
  if (typeof window === "undefined") return { ok: false, reason: "no_bluetooth" }
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return { ok: false, reason: "ios" }
  if (!window.isSecureContext) return { ok: false, reason: "insecure" }
  if (!(navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth) return { ok: false, reason: "no_bluetooth" }
  return { ok: true }
}

/** Opens Chrome's device picker and connects to the chosen adapter. */
export async function connectBleAdapter(onDisconnect?: () => void): Promise<ObdTransport & { name: string }> {
  const bt = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
  if (!bt) throw new Error("This browser can't use Bluetooth")
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PROFILES.map((p) => p.service) })
  if (!device.gatt) throw new Error("This device can't be connected")
  const server = await device.gatt.connect()

  let notifyChar: Characteristic | null = null
  let writeChar: Characteristic | null = null
  for (const p of PROFILES) {
    try {
      const svc = await server.getPrimaryService(p.service)
      notifyChar = await svc.getCharacteristic(p.notify)
      writeChar = await svc.getCharacteristic(p.write)
      break
    } catch {
      notifyChar = writeChar = null
    }
  }
  if (!notifyChar || !writeChar) {
    server.disconnect()
    throw new Error("That doesn't look like an OBD adapter. Pick the one named OBD, OBDII, Vgate, Veepeak or similar.")
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let waiter: ((s: string) => void) | null = null
  notifyChar.addEventListener("characteristicvaluechanged", (e) => {
    const v = (e.target as Characteristic).value
    if (!v) return
    buffer += decoder.decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
    if (buffer.includes(">") && waiter) {
      const out = buffer
      buffer = ""
      const w = waiter
      waiter = null
      w(out)
    }
  })
  await notifyChar.startNotifications()
  device.addEventListener("gattserverdisconnected", () => onDisconnect?.())

  const w = writeChar
  const write = async (data: Uint8Array) => {
    for (let i = 0; i < data.length; i += 20) {
      const chunk = data.slice(i, i + 20)
      if (w.properties.writeWithoutResponse && w.writeValueWithoutResponse) await w.writeValueWithoutResponse(chunk)
      else await w.writeValue(chunk)
    }
  }

  // One command at a time.
  let queue: Promise<unknown> = Promise.resolve()
  const send = (command: string, timeoutMs = 5000) => {
    const run = async () => {
      buffer = ""
      const reply = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => { waiter = null; reject(new Error(`Timed out waiting for ${command}`)) }, timeoutMs)
        waiter = (s) => { clearTimeout(timer); resolve(s) }
      })
      await write(encoder.encode(`${command}\r`))
      return reply
    }
    const p = queue.then(run, run)
    queue = p.catch(() => undefined)
    return p
  }

  return {
    name: device.name ?? "OBD adapter",
    send,
    async close() { try { server.disconnect() } catch { /* already gone */ } },
  }
}
