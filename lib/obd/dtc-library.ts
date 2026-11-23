/**
 * Fault-code library (P8-13): plain meanings for common generic OBD-II
 * codes, how urgent they are, and the parts most often behind them
 * (slugs from the standard parts list). Codes not listed are described
 * from their structure. Meanings are the standard SAE J2012 ones; the
 * manufacturer may use a code slightly differently, which the AI
 * explanation takes into account.
 */

export type Severity = "stop" | "soon" | "monitor"
export type DtcInfo = { code: string; title: string; system: string; severity: Severity; parts: string[]; tip?: string; known: boolean }

type Entry = [title: string, system: string, severity: Severity, parts: string[], tip?: string]

const FUEL = "Fuel & air"
const IGN = "Ignition"
const EMI = "Emissions"
const COOL = "Cooling"
const TRANS = "Transmission"
const ELEC = "Electrical"
const ECU = "Engine computer"
const NET = "Network"
const ENG = "Engine"
const O2 = ["oxygen-sensor"]
const MISFIRE = ["spark-plugs", "ignition-coil", "fuel-injector"]
const MISFIRE_TIP = "If the engine light is flashing, stop driving — unburnt fuel can destroy the catalytic converter."

const LIB: Record<string, Entry> = {
  P0010: ["Intake camshaft timing actuator circuit (bank 1)", ENG, "soon", ["engine-oil"], "Often low or dirty oil; check oil level first."],
  P0011: ["Intake camshaft timing over-advanced (bank 1)", ENG, "soon", ["engine-oil", "timing-chain-kit"], "Often old or wrong-grade oil; a stretched timing chain is the expensive cause."],
  P0012: ["Intake camshaft timing over-retarded (bank 1)", ENG, "soon", ["engine-oil", "timing-chain-kit"]],
  P0014: ["Exhaust camshaft timing over-advanced (bank 1)", ENG, "soon", ["engine-oil", "timing-chain-kit"]],
  P0016: ["Crankshaft and camshaft positions don't agree (bank 1)", ENG, "soon", ["timing-chain-kit", "timing-belt", "camshaft-sensor", "crankshaft-sensor"], "Can mean the timing has jumped — don't ignore it."],
  P0087: ["Fuel rail pressure too low", FUEL, "soon", ["fuel-filter", "fuel-pump"]],
  P0088: ["Fuel rail pressure too high", FUEL, "soon", []],
  P0093: ["Large fuel leak detected", FUEL, "stop", [], "Fire risk — stop and check for fuel leaks."],
  P0100: ["Air flow (MAF) sensor circuit", FUEL, "soon", ["maf-sensor"]],
  P0101: ["Air flow (MAF) sensor reading out of range", FUEL, "soon", ["maf-sensor", "air-filter"], "A dirty air filter or air leak after the sensor can cause this."],
  P0102: ["Air flow (MAF) sensor signal low", FUEL, "soon", ["maf-sensor"]],
  P0103: ["Air flow (MAF) sensor signal high", FUEL, "soon", ["maf-sensor"]],
  P0106: ["Manifold pressure (MAP) sensor reading out of range", FUEL, "soon", []],
  P0107: ["Manifold pressure (MAP) sensor signal low", FUEL, "soon", []],
  P0108: ["Manifold pressure (MAP) sensor signal high", FUEL, "soon", []],
  P0110: ["Intake air temperature sensor circuit", FUEL, "monitor", []],
  P0112: ["Intake air temperature sensor signal low", FUEL, "monitor", []],
  P0113: ["Intake air temperature sensor signal high", FUEL, "monitor", [], "Often an unplugged or damaged sensor connector."],
  P0115: ["Coolant temperature sensor circuit", COOL, "soon", ["temperature-sensor"]],
  P0116: ["Coolant temperature sensor reading out of range", COOL, "soon", ["temperature-sensor", "thermostat"]],
  P0117: ["Coolant temperature sensor signal low", COOL, "soon", ["temperature-sensor"]],
  P0118: ["Coolant temperature sensor signal high", COOL, "soon", ["temperature-sensor"]],
  P0120: ["Throttle position sensor circuit", FUEL, "soon", ["throttle-body"]],
  P0121: ["Throttle position sensor reading out of range", FUEL, "soon", ["throttle-body"]],
  P0122: ["Throttle position sensor signal low", FUEL, "soon", ["throttle-body"]],
  P0123: ["Throttle position sensor signal high", FUEL, "soon", ["throttle-body"]],
  P0125: ["Engine takes too long to warm up for fuel control", COOL, "monitor", ["thermostat", "temperature-sensor"]],
  P0128: ["Engine running too cool — thermostat", COOL, "monitor", ["thermostat"], "Usually a thermostat stuck open."],
  P0130: ["Front oxygen sensor circuit (bank 1)", EMI, "monitor", O2],
  P0131: ["Front oxygen sensor signal low (bank 1)", EMI, "monitor", O2],
  P0132: ["Front oxygen sensor signal high (bank 1)", EMI, "monitor", O2],
  P0133: ["Front oxygen sensor slow to respond (bank 1)", EMI, "monitor", O2],
  P0134: ["Front oxygen sensor not responding (bank 1)", EMI, "monitor", O2],
  P0135: ["Front oxygen sensor heater circuit (bank 1)", EMI, "monitor", O2],
  P0136: ["Rear oxygen sensor circuit (bank 1)", EMI, "monitor", O2],
  P0137: ["Rear oxygen sensor signal low (bank 1)", EMI, "monitor", O2],
  P0138: ["Rear oxygen sensor signal high (bank 1)", EMI, "monitor", O2],
  P0140: ["Rear oxygen sensor not responding (bank 1)", EMI, "monitor", O2],
  P0141: ["Rear oxygen sensor heater circuit (bank 1)", EMI, "monitor", O2],
  P0150: ["Front oxygen sensor circuit (bank 2)", EMI, "monitor", O2],
  P0155: ["Front oxygen sensor heater circuit (bank 2)", EMI, "monitor", O2],
  P0161: ["Rear oxygen sensor heater circuit (bank 2)", EMI, "monitor", O2],
  P0171: ["Engine running too lean (bank 1)", FUEL, "soon", ["maf-sensor", "fuel-filter", "fuel-pump", "pcv-valve"], "Most often an air (vacuum) leak or a dirty MAF sensor."],
  P0172: ["Engine running too rich (bank 1)", FUEL, "soon", ["maf-sensor", "oxygen-sensor", "fuel-injector", "air-filter"]],
  P0174: ["Engine running too lean (bank 2)", FUEL, "soon", ["maf-sensor", "fuel-filter", "fuel-pump", "pcv-valve"]],
  P0175: ["Engine running too rich (bank 2)", FUEL, "soon", ["maf-sensor", "oxygen-sensor", "fuel-injector"]],
  P0190: ["Fuel rail pressure sensor circuit", FUEL, "soon", []],
  P0191: ["Fuel rail pressure sensor reading out of range", FUEL, "soon", ["fuel-filter", "fuel-pump"]],
  P0201: ["Injector circuit — cylinder 1", FUEL, "soon", ["fuel-injector"]],
  P0202: ["Injector circuit — cylinder 2", FUEL, "soon", ["fuel-injector"]],
  P0203: ["Injector circuit — cylinder 3", FUEL, "soon", ["fuel-injector"]],
  P0204: ["Injector circuit — cylinder 4", FUEL, "soon", ["fuel-injector"]],
  P0217: ["Engine overheating", COOL, "stop", ["coolant", "thermostat", "water-pump", "radiator", "radiator-fan"], "Stop the engine now — driving hot can warp the head and blow the head gasket."],
  P0218: ["Transmission overheating", TRANS, "stop", ["atf"], "Stop and let it cool; low or burnt transmission fluid is common."],
  P0219: ["Engine over-revved", ENG, "monitor", []],
  P0230: ["Fuel pump relay/circuit", FUEL, "soon", ["fuel-pump", "relay"]],
  P0234: ["Turbo boost too high", ENG, "soon", ["turbocharger"]],
  P0261: ["Injector circuit low — cylinder 1", FUEL, "soon", ["fuel-injector"]],
  P0299: ["Turbo boost too low", ENG, "soon", ["turbocharger"], "Check for split boost hoses before replacing the turbo."],
  P0300: ["Random or multiple misfires", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0301: ["Misfire — cylinder 1", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0302: ["Misfire — cylinder 2", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0303: ["Misfire — cylinder 3", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0304: ["Misfire — cylinder 4", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0305: ["Misfire — cylinder 5", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0306: ["Misfire — cylinder 6", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0307: ["Misfire — cylinder 7", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0308: ["Misfire — cylinder 8", IGN, "soon", MISFIRE, MISFIRE_TIP],
  P0325: ["Knock sensor circuit (bank 1)", IGN, "monitor", []],
  P0327: ["Knock sensor signal low (bank 1)", IGN, "monitor", []],
  P0335: ["Crankshaft position sensor circuit", IGN, "soon", ["crankshaft-sensor"], "The engine may cut out or not start."],
  P0336: ["Crankshaft position sensor reading out of range", IGN, "soon", ["crankshaft-sensor"]],
  P0340: ["Camshaft position sensor circuit (bank 1)", IGN, "soon", ["camshaft-sensor"]],
  P0341: ["Camshaft position sensor reading out of range (bank 1)", IGN, "soon", ["camshaft-sensor", "timing-belt"]],
  P0351: ["Ignition coil A circuit", IGN, "soon", ["ignition-coil"]],
  P0352: ["Ignition coil B circuit", IGN, "soon", ["ignition-coil"]],
  P0353: ["Ignition coil C circuit", IGN, "soon", ["ignition-coil"]],
  P0354: ["Ignition coil D circuit", IGN, "soon", ["ignition-coil"]],
  P0380: ["Glow plug circuit", IGN, "monitor", ["glow-plugs", "relay"], "Hard starting when cold is the usual sign."],
  P0400: ["EGR flow problem", EMI, "monitor", ["egr-valve"]],
  P0401: ["EGR flow too low", EMI, "monitor", ["egr-valve"], "Carbon build-up in the EGR passages is common."],
  P0402: ["EGR flow too high", EMI, "soon", ["egr-valve"]],
  P0403: ["EGR control circuit", EMI, "monitor", ["egr-valve"]],
  P0410: ["Secondary air injection system", EMI, "monitor", []],
  P0420: ["Catalytic converter not cleaning well enough (bank 1)", EMI, "monitor", ["catalytic-converter", "oxygen-sensor"], "Fix any misfire or oxygen-sensor codes first — they can cause this."],
  P0430: ["Catalytic converter not cleaning well enough (bank 2)", EMI, "monitor", ["catalytic-converter", "oxygen-sensor"]],
  P0440: ["Fuel vapour (EVAP) system fault", EMI, "monitor", [], "Check the fuel cap is tight first."],
  P0441: ["Fuel vapour (EVAP) purge flow incorrect", EMI, "monitor", []],
  P0442: ["Small fuel vapour (EVAP) leak", EMI, "monitor", [], "Check the fuel cap seal first."],
  P0443: ["EVAP purge valve circuit", EMI, "monitor", []],
  P0446: ["EVAP vent control problem", EMI, "monitor", []],
  P0455: ["Large fuel vapour (EVAP) leak", EMI, "monitor", [], "Very often the fuel cap is loose or missing."],
  P0456: ["Very small fuel vapour (EVAP) leak", EMI, "monitor", []],
  P0480: ["Cooling fan control circuit", COOL, "soon", ["radiator-fan", "relay"], "Watch the temperature gauge in traffic."],
  P0500: ["Vehicle speed sensor", TRANS, "soon", [], "The speedometer and gear changes may act up."],
  P0505: ["Idle control system", FUEL, "monitor", ["throttle-body"], "Often a dirty throttle body — cleaning may fix it."],
  P0506: ["Idle speed lower than expected", FUEL, "monitor", ["throttle-body"]],
  P0507: ["Idle speed higher than expected", FUEL, "monitor", ["throttle-body"], "Often an air leak or dirty throttle body."],
  P0520: ["Oil pressure sensor circuit", ENG, "soon", [], "Check the oil level now; if the oil light is on, stop the engine."],
  P0524: ["Engine oil pressure too low", ENG, "stop", ["engine-oil", "oil-pump"], "Stop the engine — running without oil pressure destroys it quickly."],
  P0560: ["System voltage problem", ELEC, "soon", ["battery", "alternator", "battery-terminals"]],
  P0562: ["System voltage low", ELEC, "soon", ["alternator", "battery", "battery-terminals"]],
  P0563: ["System voltage high", ELEC, "soon", ["alternator"], "A faulty alternator regulator can damage the battery and electronics."],
  P0571: ["Brake switch circuit", ELEC, "soon", ["brake-light-switch"], "Brake lights may not work — check them."],
  P0600: ["Engine computer communication fault", ECU, "soon", []],
  P0601: ["Engine computer memory error", ECU, "soon", ["ecu"]],
  P0602: ["Engine computer not programmed", ECU, "soon", ["ecu"]],
  P0606: ["Engine computer processor fault", ECU, "soon", ["ecu"], "Check power and earth connections before replacing the computer."],
  P0700: ["Transmission computer has a fault — read its codes", TRANS, "soon", ["atf"]],
  P0705: ["Gear selector (range) sensor circuit", TRANS, "soon", []],
  P0715: ["Transmission input speed sensor", TRANS, "soon", []],
  P0720: ["Transmission output speed sensor", TRANS, "soon", []],
  P0730: ["Wrong gear ratio", TRANS, "soon", ["atf", "transmission-filter", "gearbox"], "Check the fluid level and condition first."],
  P0740: ["Torque converter clutch circuit", TRANS, "soon", ["atf"]],
  P0741: ["Torque converter clutch stuck off", TRANS, "soon", ["atf"]],
  P0750: ["Shift solenoid A", TRANS, "soon", ["atf", "transmission-filter"]],
  P0755: ["Shift solenoid B", TRANS, "soon", ["atf", "transmission-filter"]],
  P0880: ["Transmission computer power supply", TRANS, "soon", ["battery-terminals", "fuses"]],
  P2096: ["After-catalyst fuel trim too lean (bank 1)", EMI, "monitor", ["oxygen-sensor", "exhaust-gasket"], "An exhaust leak before the rear sensor is common."],
  P2097: ["After-catalyst fuel trim too rich (bank 1)", EMI, "monitor", ["oxygen-sensor", "catalytic-converter"]],
  P2135: ["Throttle position sensors disagree", FUEL, "soon", ["throttle-body"], "The car may go into limp mode."],
  P2187: ["Too lean at idle (bank 1)", FUEL, "monitor", ["pcv-valve"], "Usually a vacuum leak."],
  P2188: ["Too rich at idle (bank 1)", FUEL, "monitor", ["fuel-injector"]],
  P2195: ["Front oxygen sensor stuck lean (bank 1)", EMI, "monitor", O2],
  P2196: ["Front oxygen sensor stuck rich (bank 1)", EMI, "monitor", O2],
  P2270: ["Rear oxygen sensor stuck lean (bank 1)", EMI, "monitor", O2],
  P2271: ["Rear oxygen sensor stuck rich (bank 1)", EMI, "monitor", O2],
  P2A00: ["Front oxygen sensor reading out of range (bank 1)", EMI, "monitor", O2],
  U0001: ["High-speed CAN network fault", NET, "soon", ["wiring-harness"]],
  U0100: ["Lost communication with the engine computer", NET, "soon", ["ecu", "wiring-harness"]],
  U0101: ["Lost communication with the transmission computer", NET, "soon", ["wiring-harness"]],
  U0121: ["Lost communication with the ABS module", NET, "soon", ["wiring-harness"], "ABS may not work — brake gently."],
  U0140: ["Lost communication with the body control module", NET, "monitor", ["wiring-harness"]],
  U0155: ["Lost communication with the instrument cluster", NET, "monitor", ["instrument-cluster"]],
}

const P_SUBSYSTEM: Record<string, [string, string[]]> = {
  "0": ["Fuel & air metering or emissions", []],
  "1": ["Fuel & air metering", []],
  "2": ["Fuel & air metering (injectors)", ["fuel-injector"]],
  "3": ["Ignition or misfire", ["spark-plugs", "ignition-coil"]],
  "4": ["Emissions controls", []],
  "5": ["Speed, idle control or inputs", []],
  "6": ["Engine computer or outputs", []],
  "7": ["Transmission", []],
  "8": ["Transmission", []],
  "9": ["Transmission", []],
  A: ["Hybrid system", []],
}

export function isDtcCode(s: string): boolean {
  return /^[PCBU][0-3][0-9A-F]{3}$/.test(s.toUpperCase())
}

/** Meaning, severity and likely parts for a code (library first, then from its structure). */
export function describeDtc(raw: string): DtcInfo {
  const code = raw.trim().toUpperCase()
  const hit = LIB[code]
  if (hit) {
    const [title, system, severity, parts, tip] = hit
    return { code, title, system, severity, parts, tip, known: true }
  }
  const letter = code[0]
  const makerSpecific = code[1] === "1" || code[1] === "3" || (letter !== "P" && code[1] === "2")
  const note = makerSpecific ? " (maker-specific code — meaning depends on the brand)" : ""
  if (letter === "P") {
    const [sys, parts] = P_SUBSYSTEM[code[2]] ?? ["Engine or transmission", []]
    return { code, title: `${sys} fault${note}`, system: sys.split(" ")[0] === "Transmission" ? TRANS : sys.includes("Ignition") ? IGN : ENG, severity: "soon", parts, known: false }
  }
  if (letter === "C") return { code, title: `Chassis fault — brakes, ABS, steering or suspension${note}`, system: "Chassis", severity: "soon", parts: [], known: false }
  if (letter === "B") return { code, title: `Body fault — airbags, lights, locks or comfort systems${note}`, system: "Body", severity: "monitor", parts: [], known: false }
  return { code, title: `Network fault — modules not talking to each other${note}`, system: NET, severity: "soon", parts: [], known: false }
}

export const LIBRARY_SIZE = Object.keys(LIB).length

const RANK: Record<Severity, number> = { stop: 0, soon: 1, monitor: 2 }
export function worstSeverity(list: { severity: Severity }[]): Severity | null {
  return list.reduce<Severity | null>((w, x) => (w === null || RANK[x.severity] < RANK[w] ? x.severity : w), null)
}
