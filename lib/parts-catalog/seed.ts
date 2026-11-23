/**
 * FixAm standard parts list — seed data (P8-01).
 * Source of truth for the initial part_types rows (seeded by migration 0017).
 * Local-language names (Twi, Ga, Ewe, Hausa) are added by platform admins in
 * /admin → Parts list, so they come from people who actually use them.
 */
export type PartTypeSeed = {
  slug: string
  name: string
  category: string
  synonyms: string[]
  typicalLabourHours: number
}

export const PART_CATEGORIES = ["Engine", "Cooling", "Brakes", "Suspension & steering", "Transmission & clutch", "Electrical", "Lights", "Air conditioning", "Exhaust", "Tyres & wheels", "Body & glass", "Interior & safety", "Fluids & service"] as const

export const PART_TYPE_SEED: PartTypeSeed[] = [
  {
    "slug": "engine-oil",
    "name": "Engine oil",
    "category": "Engine",
    "synonyms": [
      "motor oil",
      "oil",
      "lubricant"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "oil-filter",
    "name": "Oil filter",
    "category": "Engine",
    "synonyms": [
      "filter"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "air-filter",
    "name": "Air filter",
    "category": "Engine",
    "synonyms": [
      "air cleaner",
      "air element"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "spark-plugs",
    "name": "Spark plugs",
    "category": "Engine",
    "synonyms": [
      "plugs",
      "plug"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "ignition-coil",
    "name": "Ignition coil",
    "category": "Engine",
    "synonyms": [
      "coil pack",
      "coil"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "timing-belt",
    "name": "Timing belt",
    "category": "Engine",
    "synonyms": [
      "cam belt"
    ],
    "typicalLabourHours": 3.0
  },
  {
    "slug": "timing-chain-kit",
    "name": "Timing chain kit",
    "category": "Engine",
    "synonyms": [
      "timing chain"
    ],
    "typicalLabourHours": 5.0
  },
  {
    "slug": "drive-belt",
    "name": "Drive belt",
    "category": "Engine",
    "synonyms": [
      "fan belt",
      "serpentine belt",
      "v-belt"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "belt-tensioner",
    "name": "Belt tensioner",
    "category": "Engine",
    "synonyms": [
      "tensioner"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "idler-pulley",
    "name": "Idler pulley",
    "category": "Engine",
    "synonyms": [
      "pulley"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "valve-cover-gasket",
    "name": "Valve cover gasket",
    "category": "Engine",
    "synonyms": [
      "tappet cover gasket",
      "rocker cover gasket"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "head-gasket",
    "name": "Head gasket",
    "category": "Engine",
    "synonyms": [
      "cylinder head gasket"
    ],
    "typicalLabourHours": 8.0
  },
  {
    "slug": "engine-mount",
    "name": "Engine mount",
    "category": "Engine",
    "synonyms": [
      "engine mounting",
      "engine rubber"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "gearbox-mount",
    "name": "Gearbox mount",
    "category": "Engine",
    "synonyms": [
      "transmission mount"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "piston-rings",
    "name": "Piston rings",
    "category": "Engine",
    "synonyms": [
      "rings"
    ],
    "typicalLabourHours": 12.0
  },
  {
    "slug": "crankshaft-seal",
    "name": "Crankshaft oil seal",
    "category": "Engine",
    "synonyms": [
      "crank seal",
      "oil seal"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "camshaft-sensor",
    "name": "Camshaft position sensor",
    "category": "Engine",
    "synonyms": [
      "cam sensor",
      "CMP sensor"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "crankshaft-sensor",
    "name": "Crankshaft position sensor",
    "category": "Engine",
    "synonyms": [
      "crank sensor",
      "CKP sensor"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "oxygen-sensor",
    "name": "Oxygen sensor",
    "category": "Engine",
    "synonyms": [
      "O2 sensor",
      "lambda sensor"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "maf-sensor",
    "name": "Mass air flow sensor",
    "category": "Engine",
    "synonyms": [
      "MAF",
      "air flow meter"
    ],
    "typicalLabourHours": 0.4
  },
  {
    "slug": "throttle-body",
    "name": "Throttle body",
    "category": "Engine",
    "synonyms": [
      "throttle"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "fuel-injector",
    "name": "Fuel injector",
    "category": "Engine",
    "synonyms": [
      "injector",
      "nozzle"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "fuel-pump",
    "name": "Fuel pump",
    "category": "Engine",
    "synonyms": [
      "petrol pump"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "fuel-filter",
    "name": "Fuel filter",
    "category": "Engine",
    "synonyms": [
      "petrol filter",
      "diesel filter"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "pcv-valve",
    "name": "PCV valve",
    "category": "Engine",
    "synonyms": [
      "breather valve"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "egr-valve",
    "name": "EGR valve",
    "category": "Engine",
    "synonyms": [
      "EGR"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "turbocharger",
    "name": "Turbocharger",
    "category": "Engine",
    "synonyms": [
      "turbo"
    ],
    "typicalLabourHours": 5.0
  },
  {
    "slug": "ecu",
    "name": "Engine control unit",
    "category": "Engine",
    "synonyms": [
      "ECU",
      "computer box",
      "brain box"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "oil-pump",
    "name": "Oil pump",
    "category": "Engine",
    "synonyms": [],
    "typicalLabourHours": 4.0
  },
  {
    "slug": "sump-gasket",
    "name": "Sump gasket",
    "category": "Engine",
    "synonyms": [
      "oil pan gasket"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "glow-plugs",
    "name": "Glow plugs",
    "category": "Engine",
    "synonyms": [
      "heater plugs"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "radiator",
    "name": "Radiator",
    "category": "Cooling",
    "synonyms": [],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "radiator-hose",
    "name": "Radiator hose",
    "category": "Cooling",
    "synonyms": [
      "water hose",
      "hose"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "water-pump",
    "name": "Water pump",
    "category": "Cooling",
    "synonyms": [],
    "typicalLabourHours": 2.5
  },
  {
    "slug": "thermostat",
    "name": "Thermostat",
    "category": "Cooling",
    "synonyms": [],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "radiator-fan",
    "name": "Radiator fan",
    "category": "Cooling",
    "synonyms": [
      "cooling fan",
      "fan motor"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "fan-clutch",
    "name": "Fan clutch",
    "category": "Cooling",
    "synonyms": [
      "viscous fan"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "coolant",
    "name": "Coolant",
    "category": "Cooling",
    "synonyms": [
      "antifreeze",
      "radiator water"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "radiator-cap",
    "name": "Radiator cap",
    "category": "Cooling",
    "synonyms": [],
    "typicalLabourHours": 0.1
  },
  {
    "slug": "expansion-tank",
    "name": "Expansion tank",
    "category": "Cooling",
    "synonyms": [
      "coolant reservoir",
      "overflow bottle"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "temperature-sensor",
    "name": "Temperature sensor",
    "category": "Cooling",
    "synonyms": [
      "temp sensor",
      "coolant sensor"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "front-brake-pads",
    "name": "Front brake pads",
    "category": "Brakes",
    "synonyms": [
      "brake pads",
      "pads",
      "brake shoe front"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "rear-brake-pads",
    "name": "Rear brake pads",
    "category": "Brakes",
    "synonyms": [
      "brake pads",
      "pads"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "rear-brake-shoes",
    "name": "Rear brake shoes",
    "category": "Brakes",
    "synonyms": [
      "brake shoes",
      "linings"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "front-brake-discs",
    "name": "Front brake discs",
    "category": "Brakes",
    "synonyms": [
      "rotors",
      "discs",
      "brake disc"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "rear-brake-discs",
    "name": "Rear brake discs",
    "category": "Brakes",
    "synonyms": [
      "rotors",
      "discs"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "brake-drums",
    "name": "Brake drums",
    "category": "Brakes",
    "synonyms": [
      "drum"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "brake-caliper",
    "name": "Brake caliper",
    "category": "Brakes",
    "synonyms": [
      "caliper"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "brake-master-cylinder",
    "name": "Brake master cylinder",
    "category": "Brakes",
    "synonyms": [
      "master cylinder"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "wheel-cylinder",
    "name": "Wheel cylinder",
    "category": "Brakes",
    "synonyms": [
      "brake cylinder"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "brake-fluid",
    "name": "Brake fluid",
    "category": "Brakes",
    "synonyms": [
      "DOT 4",
      "DOT 3"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "brake-hose",
    "name": "Brake hose",
    "category": "Brakes",
    "synonyms": [
      "brake pipe",
      "flexible hose"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "brake-booster",
    "name": "Brake booster",
    "category": "Brakes",
    "synonyms": [
      "servo"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "abs-sensor",
    "name": "ABS sensor",
    "category": "Brakes",
    "synonyms": [
      "wheel speed sensor"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "handbrake-cable",
    "name": "Handbrake cable",
    "category": "Brakes",
    "synonyms": [
      "parking brake cable"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "front-shock-absorbers",
    "name": "Front shock absorbers",
    "category": "Suspension & steering",
    "synonyms": [
      "shocks",
      "front shocks",
      "struts"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "rear-shock-absorbers",
    "name": "Rear shock absorbers",
    "category": "Suspension & steering",
    "synonyms": [
      "shocks",
      "rear shocks"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "shock-mount",
    "name": "Shock absorber mount",
    "category": "Suspension & steering",
    "synonyms": [
      "strut mount",
      "top mount"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "coil-spring",
    "name": "Coil spring",
    "category": "Suspension & steering",
    "synonyms": [
      "spring"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "leaf-spring",
    "name": "Leaf spring",
    "category": "Suspension & steering",
    "synonyms": [
      "spring blade"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "ball-joint",
    "name": "Ball joint",
    "category": "Suspension & steering",
    "synonyms": [],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "control-arm",
    "name": "Control arm",
    "category": "Suspension & steering",
    "synonyms": [
      "lower arm",
      "wishbone",
      "track control arm"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "control-arm-bushing",
    "name": "Control arm bushing",
    "category": "Suspension & steering",
    "synonyms": [
      "bush",
      "bushing",
      "arm bush"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "stabilizer-link",
    "name": "Stabilizer link",
    "category": "Suspension & steering",
    "synonyms": [
      "sway bar link",
      "link rod",
      "stabilizer"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "stabilizer-bushing",
    "name": "Stabilizer bushing",
    "category": "Suspension & steering",
    "synonyms": [
      "sway bar bush"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "tie-rod-end",
    "name": "Tie rod end",
    "category": "Suspension & steering",
    "synonyms": [
      "track rod end",
      "rack end"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "steering-rack",
    "name": "Steering rack",
    "category": "Suspension & steering",
    "synonyms": [
      "rack and pinion"
    ],
    "typicalLabourHours": 4.0
  },
  {
    "slug": "power-steering-pump",
    "name": "Power steering pump",
    "category": "Suspension & steering",
    "synonyms": [
      "steering pump"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "power-steering-fluid",
    "name": "Power steering fluid",
    "category": "Suspension & steering",
    "synonyms": [
      "steering oil"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "wheel-bearing",
    "name": "Wheel bearing",
    "category": "Suspension & steering",
    "synonyms": [
      "hub bearing",
      "bearing"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "wheel-hub",
    "name": "Wheel hub",
    "category": "Suspension & steering",
    "synonyms": [
      "hub"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "cv-joint",
    "name": "CV joint",
    "category": "Suspension & steering",
    "synonyms": [
      "constant velocity joint",
      "CV"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "cv-boot",
    "name": "CV boot",
    "category": "Suspension & steering",
    "synonyms": [
      "drive shaft boot"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "drive-shaft",
    "name": "Drive shaft",
    "category": "Suspension & steering",
    "synonyms": [
      "axle shaft",
      "half shaft"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "steering-column",
    "name": "Steering column",
    "category": "Suspension & steering",
    "synonyms": [],
    "typicalLabourHours": 3.0
  },
  {
    "slug": "clutch-kit",
    "name": "Clutch kit",
    "category": "Transmission & clutch",
    "synonyms": [
      "clutch plate",
      "pressure plate",
      "clutch"
    ],
    "typicalLabourHours": 5.0
  },
  {
    "slug": "clutch-release-bearing",
    "name": "Clutch release bearing",
    "category": "Transmission & clutch",
    "synonyms": [
      "thrust bearing",
      "release bearing"
    ],
    "typicalLabourHours": 5.0
  },
  {
    "slug": "clutch-master-cylinder",
    "name": "Clutch master cylinder",
    "category": "Transmission & clutch",
    "synonyms": [],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "clutch-slave-cylinder",
    "name": "Clutch slave cylinder",
    "category": "Transmission & clutch",
    "synonyms": [],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "clutch-cable",
    "name": "Clutch cable",
    "category": "Transmission & clutch",
    "synonyms": [],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "flywheel",
    "name": "Flywheel",
    "category": "Transmission & clutch",
    "synonyms": [],
    "typicalLabourHours": 6.0
  },
  {
    "slug": "gearbox-oil",
    "name": "Gearbox oil",
    "category": "Transmission & clutch",
    "synonyms": [
      "transmission oil",
      "gear oil"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "atf",
    "name": "ATF",
    "category": "Transmission & clutch",
    "synonyms": [
      "automatic transmission fluid",
      "gear oil auto"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "transmission-filter",
    "name": "Transmission filter",
    "category": "Transmission & clutch",
    "synonyms": [
      "gearbox filter"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "gearbox",
    "name": "Gearbox",
    "category": "Transmission & clutch",
    "synonyms": [
      "transmission",
      "gear box"
    ],
    "typicalLabourHours": 8.0
  },
  {
    "slug": "differential-oil",
    "name": "Differential oil",
    "category": "Transmission & clutch",
    "synonyms": [
      "diff oil"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "propeller-shaft",
    "name": "Propeller shaft",
    "category": "Transmission & clutch",
    "synonyms": [
      "prop shaft",
      "cardan shaft"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "universal-joint",
    "name": "Universal joint",
    "category": "Transmission & clutch",
    "synonyms": [
      "UJ",
      "cross joint"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "battery",
    "name": "Battery",
    "category": "Electrical",
    "synonyms": [
      "car battery"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "alternator",
    "name": "Alternator",
    "category": "Electrical",
    "synonyms": [
      "dynamo",
      "charging system"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "starter-motor",
    "name": "Starter motor",
    "category": "Electrical",
    "synonyms": [
      "starter",
      "self starter"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "fuses",
    "name": "Fuses",
    "category": "Electrical",
    "synonyms": [
      "fuse"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "relay",
    "name": "Relay",
    "category": "Electrical",
    "synonyms": [],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "ignition-switch",
    "name": "Ignition switch",
    "category": "Electrical",
    "synonyms": [
      "key switch"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "horn",
    "name": "Horn",
    "category": "Electrical",
    "synonyms": [],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "window-regulator",
    "name": "Window regulator",
    "category": "Electrical",
    "synonyms": [
      "window motor",
      "power window"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "door-lock-actuator",
    "name": "Central locking actuator",
    "category": "Electrical",
    "synonyms": [
      "door lock motor",
      "central lock"
    ],
    "typicalLabourHours": 1.2
  },
  {
    "slug": "wiper-motor",
    "name": "Wiper motor",
    "category": "Electrical",
    "synonyms": [],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "battery-terminals",
    "name": "Battery terminals",
    "category": "Electrical",
    "synonyms": [
      "terminal",
      "clamp"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "wiring-harness",
    "name": "Wiring harness",
    "category": "Electrical",
    "synonyms": [
      "wiring",
      "loom"
    ],
    "typicalLabourHours": 3.0
  },
  {
    "slug": "instrument-cluster",
    "name": "Instrument cluster",
    "category": "Electrical",
    "synonyms": [
      "dashboard",
      "speedometer"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "key-fob",
    "name": "Key fob",
    "category": "Electrical",
    "synonyms": [
      "remote key",
      "car key"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "headlight",
    "name": "Headlight",
    "category": "Lights",
    "synonyms": [
      "head lamp",
      "front light"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "headlight-bulb",
    "name": "Headlight bulb",
    "category": "Lights",
    "synonyms": [
      "bulb",
      "H4",
      "H7"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "tail-light",
    "name": "Tail light",
    "category": "Lights",
    "synonyms": [
      "rear light",
      "back light"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "fog-light",
    "name": "Fog light",
    "category": "Lights",
    "synonyms": [
      "fog lamp"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "indicator",
    "name": "Indicator",
    "category": "Lights",
    "synonyms": [
      "signal light",
      "trafficator"
    ],
    "typicalLabourHours": 0.4
  },
  {
    "slug": "brake-light-switch",
    "name": "Brake light switch",
    "category": "Lights",
    "synonyms": [
      "stop light switch"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "number-plate-light",
    "name": "Number plate light",
    "category": "Lights",
    "synonyms": [
      "plate light"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "ac-compressor",
    "name": "AC compressor",
    "category": "Air conditioning",
    "synonyms": [
      "compressor",
      "air con compressor"
    ],
    "typicalLabourHours": 3.0
  },
  {
    "slug": "ac-condenser",
    "name": "AC condenser",
    "category": "Air conditioning",
    "synonyms": [
      "condenser"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "ac-evaporator",
    "name": "AC evaporator",
    "category": "Air conditioning",
    "synonyms": [
      "cooling coil",
      "evaporator"
    ],
    "typicalLabourHours": 5.0
  },
  {
    "slug": "ac-gas",
    "name": "AC gas refill",
    "category": "Air conditioning",
    "synonyms": [
      "refrigerant",
      "AC gas",
      "R134a"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "cabin-filter",
    "name": "Cabin filter",
    "category": "Air conditioning",
    "synonyms": [
      "AC filter",
      "pollen filter"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "blower-motor",
    "name": "Blower motor",
    "category": "Air conditioning",
    "synonyms": [
      "AC fan"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "expansion-valve",
    "name": "Expansion valve",
    "category": "Air conditioning",
    "synonyms": [],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "ac-drier",
    "name": "AC drier",
    "category": "Air conditioning",
    "synonyms": [
      "receiver drier",
      "filter drier"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "exhaust-silencer",
    "name": "Exhaust silencer",
    "category": "Exhaust",
    "synonyms": [
      "muffler",
      "silencer"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "catalytic-converter",
    "name": "Catalytic converter",
    "category": "Exhaust",
    "synonyms": [
      "catalyst",
      "cat"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "exhaust-pipe",
    "name": "Exhaust pipe",
    "category": "Exhaust",
    "synonyms": [
      "tail pipe"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "exhaust-gasket",
    "name": "Exhaust gasket",
    "category": "Exhaust",
    "synonyms": [],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "exhaust-manifold",
    "name": "Exhaust manifold",
    "category": "Exhaust",
    "synonyms": [
      "manifold"
    ],
    "typicalLabourHours": 3.0
  },
  {
    "slug": "tyre",
    "name": "Tyre",
    "category": "Tyres & wheels",
    "synonyms": [
      "tire",
      "tyres"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "inner-tube",
    "name": "Inner tube",
    "category": "Tyres & wheels",
    "synonyms": [
      "tube"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "wheel-rim",
    "name": "Wheel rim",
    "category": "Tyres & wheels",
    "synonyms": [
      "rim",
      "alloy wheel"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "wheel-nuts",
    "name": "Wheel nuts",
    "category": "Tyres & wheels",
    "synonyms": [
      "lug nuts",
      "bolts"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "valve-stem",
    "name": "Valve stem",
    "category": "Tyres & wheels",
    "synonyms": [
      "tyre valve"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "spare-wheel",
    "name": "Spare wheel",
    "category": "Tyres & wheels",
    "synonyms": [
      "spare tyre"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "wheel-weights",
    "name": "Wheel balancing weights",
    "category": "Tyres & wheels",
    "synonyms": [
      "balancing"
    ],
    "typicalLabourHours": 0.5
  },
  {
    "slug": "windscreen",
    "name": "Windscreen",
    "category": "Body & glass",
    "synonyms": [
      "windshield",
      "front glass"
    ],
    "typicalLabourHours": 2.0
  },
  {
    "slug": "side-mirror",
    "name": "Side mirror",
    "category": "Body & glass",
    "synonyms": [
      "wing mirror",
      "door mirror"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "door-glass",
    "name": "Door glass",
    "category": "Body & glass",
    "synonyms": [
      "window glass"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "front-bumper",
    "name": "Front bumper",
    "category": "Body & glass",
    "synonyms": [
      "bumper"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "rear-bumper",
    "name": "Rear bumper",
    "category": "Body & glass",
    "synonyms": [
      "bumper"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "bonnet",
    "name": "Bonnet",
    "category": "Body & glass",
    "synonyms": [
      "hood"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "fender",
    "name": "Fender",
    "category": "Body & glass",
    "synonyms": [
      "wing"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "door-handle",
    "name": "Door handle",
    "category": "Body & glass",
    "synonyms": [
      "handle"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "wiper-blades",
    "name": "Wiper blades",
    "category": "Body & glass",
    "synonyms": [
      "wipers"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "grille",
    "name": "Grille",
    "category": "Body & glass",
    "synonyms": [
      "radiator grille"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "bonnet-cable",
    "name": "Bonnet cable",
    "category": "Body & glass",
    "synonyms": [
      "hood release cable"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "door-seal",
    "name": "Door seal",
    "category": "Body & glass",
    "synonyms": [
      "weather strip",
      "rubber seal"
    ],
    "typicalLabourHours": 0.6
  },
  {
    "slug": "seat-belt",
    "name": "Seat belt",
    "category": "Interior & safety",
    "synonyms": [
      "belt"
    ],
    "typicalLabourHours": 0.8
  },
  {
    "slug": "airbag",
    "name": "Airbag",
    "category": "Interior & safety",
    "synonyms": [
      "SRS"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "clock-spring",
    "name": "Clock spring",
    "category": "Interior & safety",
    "synonyms": [
      "spiral cable",
      "airbag coil"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "floor-mats",
    "name": "Floor mats",
    "category": "Interior & safety",
    "synonyms": [
      "mats",
      "carpet"
    ],
    "typicalLabourHours": 0.1
  },
  {
    "slug": "seat-cover",
    "name": "Seat cover",
    "category": "Interior & safety",
    "synonyms": [
      "upholstery"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "reverse-camera",
    "name": "Reverse camera",
    "category": "Interior & safety",
    "synonyms": [
      "parking camera",
      "back camera"
    ],
    "typicalLabourHours": 1.0
  },
  {
    "slug": "parking-sensors",
    "name": "Parking sensors",
    "category": "Interior & safety",
    "synonyms": [
      "reverse sensors"
    ],
    "typicalLabourHours": 1.5
  },
  {
    "slug": "washer-fluid",
    "name": "Windscreen washer fluid",
    "category": "Fluids & service",
    "synonyms": [
      "washer water"
    ],
    "typicalLabourHours": 0.1
  },
  {
    "slug": "grease",
    "name": "Grease",
    "category": "Fluids & service",
    "synonyms": [],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "engine-flush",
    "name": "Engine flush",
    "category": "Fluids & service",
    "synonyms": [
      "oil flush"
    ],
    "typicalLabourHours": 0.3
  },
  {
    "slug": "fuel-system-cleaner",
    "name": "Fuel system cleaner",
    "category": "Fluids & service",
    "synonyms": [
      "injector cleaner"
    ],
    "typicalLabourHours": 0.2
  },
  {
    "slug": "distilled-water",
    "name": "Distilled water",
    "category": "Fluids & service",
    "synonyms": [
      "battery water"
    ],
    "typicalLabourHours": 0.1
  }
]
