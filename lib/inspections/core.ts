import { z } from "zod"

/**
 * P8-20 pre-purchase inspection — pure logic: the checklist definition,
 * status transitions, scoring and input schemas. No DB access here.
 */

// ---------------------------------------------------------------------------
// Checklist — ~120 points across 10 sections. Lives here as data so it is
// unit-tested and versioned with the code.
// ---------------------------------------------------------------------------

export type ChecklistSection = {
  key: string
  label: string
  items: string[]
}

export const INSPECTION_SECTIONS: ChecklistSection[] = [
  {
    key: "body_paint",
    label: "Body & paint",
    items: [
      "Bonnet: dents, ripples, overspray",
      "Boot/trunk lid: alignment, damage",
      "Front bumper: cracks, repaint lines",
      "Rear bumper: cracks, repaint lines",
      "Both front wings/fenders: damage, rust",
      "Both rear quarters: damage, rust",
      "Both doors: gaps, dents, window seals",
      "Roof: dents, hail damage",
      "Windscreen: chips, cracks, delamination",
      "Rear window & seals",
      "Paint colour match / respray evidence",
      "Panel gaps uniform (possible accident repair)",
    ],
  },
  {
    key: "flood_accident",
    label: "Flood & accident signs",
    items: [
      "Silt/mud in seat rails & carpet edges",
      "Water line under dashboard & door cards",
      "Corrosion on seatbelt retractors & buckles",
      "Foggy/condensation inside head & tail lights",
      "Rust on underside of carpets & spare wheel well",
      "Mud in boot spare-wheel well",
      "Uneven tyre wear (possible structural pull)",
      "Frame/unibody: fresh undercoat or overspray on rails",
      "Crash-bolt paint marks on suspension points",
      "Airbag warning light / deployed airbag signs",
      "VIN plate & chassis stamps legible & matching",
      "Firewall & inner wings: repaint or sealant over damage",
    ],
  },
  {
    key: "engine",
    label: "Engine",
    items: [
      "Cold start: smoke colour (blue=oil, white=coolant)",
      "Idle: smooth, no knocking/hissing",
      "Rev range: no hesitation, misfires",
      "Oil level & condition on dipstick",
      "Coolant level & condition (oil contamination?)",
      "Belts & hoses: cracks, leaks, age",
      "Vacuum lines & gaskets: leaks",
      "Mountings: cracked, collapsed, oil-soaked",
      "Turbo (if fitted): shaft play, oil in intake",
      "Exhaust manifold & downpipe leaks",
      "Oil leaks at sump, rocker cover, seals",
      "Service history vs actual wear (oil change evidence)",
    ],
  },
  {
    key: "transmission",
    label: "Transmission & driveline",
    items: [
      "Automatic: smooth shifts 1→top, no flare/slip",
      "Manual: clutch bite point, no slip under load",
      "Gear engagement: crunch on 2nd/3rd (synchros)",
      "Reverse: engages cleanly",
      "Transmission fluid: level, colour, burnt smell",
      "Driveshafts/CV joints: clicks on full-lock turns",
      "Differential: whine/clunk on load",
      "Transfer case (4x4/AWD if fitted)",
      "Clutch pedal: spongy, high/low bite",
      "Shift linkage/ cables: smooth, no play",
      "AWD/4WD warning light & mode function",
      "No driveline vibration under acceleration",
    ],
  },
  {
    key: "suspension",
    label: "Suspension & steering",
    items: [
      "Shock absorbers: bounce test, leaks",
      "Struts: oil leaks, play",
      "Bushings: torn, perished, clunks",
      "Ball joints & tie rods: play, torn boots",
      "Springs: sagging, broken, rust-through",
      "Anti-roll bar links: worn, knocking",
      "Power steering: fluid, leaks, effort",
      "Steering rack: play, leaks",
      "Wheel bearings: growl on corners",
      "Alignment evidence: uneven tyre edges",
      "Stabiliser mounts",
      "Subframe & mounting bolts: torque marks, rust",
    ],
  },
  {
    key: "brakes",
    label: "Brakes",
    items: [
      "Brake pads: thickness front & rear",
      "Brake discs: scoring, lip, thickness/warpage",
      "Brake fluid: level, colour, spongy pedal",
      "Brake hoses: cracks, bulges, corrosion",
      "Calipers: seized, leaking, uneven wear",
      "ABS light & function on test drive",
      "Handbrake: holds on incline",
      "Brake booster: pedal sinks when held",
      "Master cylinder: external leaks",
      "Brake lines: corrosion, especially underneath",
      "Brake wear sensors",
      "Pedal feel: firm, no excessive travel",
    ],
  },
  {
    key: "electrics",
    label: "Electrics",
    items: [
      "Battery: age, voltage, terminal corrosion",
      "Alternator: charging rate (~13.8–14.4V)",
      "Starter: cranks strongly",
      "Headlights: both work, aim, lens condition",
      "Indicators & hazards: all flash correctly",
      "Brake & reverse lights",
      "Horn",
      "Wipers & washers: all speeds, blades",
      "Dashboard warning lights: all illuminate then extinguish",
      "Air conditioning: blows cold",
      "Power windows & locks: all work",
      "Central locking & keyless entry",
      " infotainment/radio & speakers",
      "Reverse camera / parking sensors",
      "Interior lights & boot light",
    ],
  },
  {
    key: "interior",
    label: "Interior",
    items: [
      "Seats: wear, tears, stains, function (heated/electric)",
      "Dashboard: cracks, sagging, rattles",
      "Steering wheel & column: wear, adjustment",
      "Pedals: rubber wear vs odometer",
      "Odometer plausibility vs wear",
      "Headliner: sagging, stains (sunroof leaks)",
      "Carpet/mats: wear pattern, stains",
      "Door cards & trim: damage, rattles",
      "Sunroof/moonroof: opens, seals, leaks",
      "Glovebox, console & storage",
      "Seatbelts: all buckle, retract, no fraying",
      "Smell: musty (flood) / smoke (abused)",
    ],
  },
  {
    key: "tyres",
    label: "Tyres & wheels",
    items: [
      "All four tyres: brand, size match",
      "Tread depth: ≥1.6mm legal, report actual",
      "Tyre age/date codes (DOT)",
      "Uneven wear: edges vs centre (alignment/pressures)",
      "Sidewall damage, bulges, repairs",
      "Spare tyre: present, inflated, serviceable",
      "Wheel rims: kerbed, buckled, missing weights",
      "TPMS sensors (if fitted)",
      "Tyre pressure (all incl. spare)",
      "Valve stems & caps",
      "Hubcentric vs universal fitment",
      "Matching tyre brands front/rear (AWD)",
    ],
  },
  {
    key: "test_drive",
    label: "Test drive notes",
    items: [
      "Cold start behaviour & smoke",
      "Idle stability & noise level",
      "Acceleration: smooth, pulls to one side?",
      "Braking: straight, no pull, no vibration",
      "Gear changes: smooth, no hunting",
      "Steering: centred, no vibration/wander",
      "Suspension noise over bumps",
      "Wind/road noise at 60–80 km/h",
      "Cruise control & trip computer",
      "Hill hold / auto-hold",
      "Overtaking power (merging onto highway)",
      "Parking manoeuvre: visibility, sensors/camera",
    ],
  },
]

export const INSPECTION_ITEM_COUNT = INSPECTION_SECTIONS.reduce((n, s) => n + s.items.length, 0)

export function itemKey(section: string, index: number): string {
  return `${section}.${index}`
}

/** Flattened catalogue: [{ key, section, label }] — stable ids for storage. */
export const CHECKLIST: { key: string; section: string; sectionLabel: string; label: string }[] = INSPECTION_SECTIONS.flatMap((s) =>
  s.items.map((label, i) => ({ key: itemKey(s.key, i), section: s.key, sectionLabel: s.label, label }))
)

// ---------------------------------------------------------------------------
// Status machine
// ---------------------------------------------------------------------------

export type InspectionStatus =
  | "awaiting_payment"
  | "booked"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"

const TRANSITIONS: Record<InspectionStatus, InspectionStatus[]> = {
  awaiting_payment: ["booked", "cancelled"],
  booked: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: ["booked", "cancelled"],
}

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as InspectionStatus] ?? []).includes(to as InspectionStatus)
}

export function nextStatuses(from: string): InspectionStatus[] {
  return TRANSITIONS[from as InspectionStatus] ?? []
}

// ---------------------------------------------------------------------------
// Results & scoring
// ---------------------------------------------------------------------------

export const ITEM_RESULTS = ["pass", "attention", "fail", "na"] as const
export type ItemResult = (typeof ITEM_RESULTS)[number]

export function summariseResults(items: { result: string }[]): {
  pass: number
  attention: number
  fail: number
  na: number
  answered: number
  total: number
  scorePct: number
} {
  const c = { pass: 0, attention: 0, fail: 0, na: 0, answered: 0, total: items.length, scorePct: 0 }
  for (const i of items) {
    if (i.result === "pass") c.pass++
    else if (i.result === "attention") c.attention++
    else if (i.result === "fail") c.fail++
    else c.na++
    if (i.result !== "na") c.answered++
  }
  const graded = c.pass + c.attention + c.fail
  if (graded > 0) {
    // attention counts half
    c.scorePct = Math.round(((c.pass + c.attention * 0.5) / graded) * 100)
  }
  return c
}

export function flaggedItems<T extends { result: string }>(items: T[]): T[] {
  return items.filter((i) => i.result === "attention" || i.result === "fail")
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const vehicleDetailsSchema = z.object({
  make: z.string().trim().max(60).optional().or(z.literal("")),
  model: z.string().trim().max(60).optional().or(z.literal("")),
  year: z.string().trim().max(4).optional().or(z.literal("")),
  plate: z.string().trim().max(20).optional().or(z.literal("")),
  vin: z.string().trim().max(17).optional().or(z.literal("")),
  bodyType: z.string().trim().max(40).optional().or(z.literal("")),
  colour: z.string().trim().max(40).optional().or(z.literal("")),
  mileageKm: z.number().int().min(0).max(2_000_000).optional(),
})
export type VehicleDetailsInput = z.infer<typeof vehicleDetailsSchema>

export const bookInspectionSchema = z.object({
  garageId: z.string().uuid(),
  vehicle: vehicleDetailsSchema,
  locationKind: z.enum(["seller", "garage"]),
  sellerName: z.string().trim().max(120).optional().or(z.literal("")),
  sellerPhone: z.string().trim().max(20).optional().or(z.literal("")),
  sellerAddress: z.string().trim().max(300).optional().or(z.literal("")),
  sellerLat: z.number().min(-90).max(90).optional(),
  sellerLng: z.number().min(-180).max(180).optional(),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})
export type BookInspectionInput = z.infer<typeof bookInspectionSchema>

export const itemResultSchema = z.object({
  inspectionId: z.string().uuid(),
  itemKey: z.string().min(1).max(80),
  result: z.enum(ITEM_RESULTS),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  photoPath: z.string().max(300).optional().or(z.literal("")),
})

export const completeInspectionSchema = z.object({
  inspectionId: z.string().uuid(),
  testDriveNotes: z.string().trim().max(3000).optional().or(z.literal("")),
})

export function newInspectionToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function isInspectionToken(s: string): boolean {
  return /^[0-9a-f]{48}$/.test(s)
}
