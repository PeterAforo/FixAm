import { BadgeCheck, Bike, Car, ShieldCheck, Store, Truck, Wrench, type LucideIcon } from "lucide-react"
import type { WorkspaceType } from "@/lib/accounts/workspaces"
import { photos, type Photo } from "@/lib/images"

export type RoleSlug = "driver" | "garage" | "parts-seller" | "insurance-broker" | "dvla-agent" | "tow-operator" | "rider"

export type RoleOption = {
  slug: RoleSlug
  type: WorkspaceType
  title: string
  /** "a garage", "a DVLA agent" … */
  noun: string
  text: string
  /** Setup wizard (signed in). */
  href: string
  /** Account creation for this role (signed out). */
  signupHref: string
  icon: LucideIcon
  /** Can one person create several of these? */
  repeatable?: boolean
  /** Sign-up screen copy */
  badge: string
  pitch: string
  intro: string
  photo: Photo
  /** Steps after "Create account" — mirrors the setup wizard. */
  steps: { label: string; hint: string }[]
}

const role = (r: Omit<RoleOption, "href" | "signupHref">): RoleOption => ({
  ...r,
  href: `/onboarding/${r.slug}`,
  signupHref: `/signup/${r.slug}`,
})

export const ROLE_OPTIONS: RoleOption[] = [
  role({
    slug: "driver",
    noun: "a driver",
    type: "driver",
    title: "I drive a car",
    text: "Track repairs, approve work, get reminders and renew insurance or roadworthy.",
    icon: Car,
    badge: "14-day free trial",
    pitch: "Your car's whole life, in your pocket.",
    intro: "Live repair updates, one-tap approvals and reminders before oil, insurance or roadworthy run out.",
    photo: photos.driverTracker,
    steps: [
      { label: "About you", hint: "Name and city" },
      { label: "Your car", hint: "Plate, make and model" },
    ],
  }),
  role({
    slug: "garage",
    noun: "a garage",
    type: "garage",
    title: "I run a garage",
    text: "Job cards, estimates, parts, MoMo payments and automatic reminders.",
    icon: Wrench,
    repeatable: true,
    badge: "14-day free Pro trial",
    pitch: "Let's get your garage running on FixAm.",
    intro: "About three minutes. No card needed.",
    photo: photos.accraWorkshop,
    steps: [
      { label: "Your garage", hint: "Name, address, location" },
      { label: "Branch & rates", hint: "Bays and labour rate" },
      { label: "Your team", hint: "Invite staff" },
    ],
  }),
  role({
    slug: "parts-seller",
    noun: "a parts seller",
    type: "vendor",
    title: "I sell parts & accessories",
    text: "List your stock and take orders from garages and drivers near you.",
    icon: Store,
    badge: "Sell to garages & drivers",
    pitch: "Put your parts in front of every garage near you.",
    intro: "Garages order straight from their job cards. Drivers order for their own cars. You deliver and get paid.",
    photo: photos.partsShop,
    steps: [
      { label: "Your shop", hint: "Name and what you sell" },
      { label: "Delivery & payouts", hint: "Areas and MoMo" },
    ],
  }),
  role({
    slug: "insurance-broker",
    noun: "an insurance broker",
    type: "broker",
    title: "I'm an insurance broker",
    text: "Receive motor insurance renewals, send quotes and close policies.",
    icon: ShieldCheck,
    badge: "For insurance brokers",
    pitch: "Motor renewals, delivered to your inbox.",
    intro: "Garages hand you renewals and drivers request quotes from their phones. You quote, process and get paid.",
    photo: photos.insuranceOffice,
    steps: [
      { label: "Your business", hint: "Name and location" },
      { label: "Services & fees", hint: "NIC licence and insurers" },
    ],
  }),
  role({
    slug: "dvla-agent",
    noun: "a DVLA agent",
    type: "broker",
    title: "I process DVLA renewals",
    text: "Roadworthy, vehicle licence and driver's licence jobs from garages and drivers.",
    icon: BadgeCheck,
    badge: "For DVLA agents",
    pitch: "Turn DVLA queues into a steady pipeline.",
    intro: "Garages and drivers send you roadworthy and licence renewals. You quote, process and get paid.",
    photo: photos.insuranceSigning,
    steps: [
      { label: "Your business", hint: "Name and location" },
      { label: "Services & fees", hint: "Agent number and fee" },
    ],
  }),
  role({
    slug: "tow-operator",
    noun: "a tow operator",
    type: "tow",
    title: "I run a tow truck",
    text: "Get breakdown calls from drivers near you, quote, tow and get paid.",
    icon: Truck,
    badge: "For towing & roadside help",
    pitch: "Breakdown calls, straight to your phone.",
    intro: "Drivers press SOS and the nearest available tow trucks get the job by SMS. First to accept gets it. You set the price; MoMo payments are held safely until the job is done.",
    photo: photos.accraCity,
    steps: [
      { label: "Your business", hint: "Name, phone and base" },
      { label: "Services & rates", hint: "What you do, fees and MoMo" },
    ],
  }),
  role({
    slug: "rider",
    noun: "a rider",
    type: "rider",
    title: "I deliver on a motorbike",
    text: "Deliver parts to garages and homes, documents to brokers — get paid per drop.",
    icon: Bike,
    badge: "Earn per delivery",
    pitch: "Deliveries near you, paid to your MoMo.",
    intro: "Go online when you're free — nearby jobs come to your phone. Pickup and drop-off PINs keep every handover safe. Earnings pay out after each confirmed delivery.",
    photo: photos.accraStreet,
    steps: [
      { label: "About you", hint: "Name, Ghana Card, bike" },
      { label: "Payouts", hint: "MoMo number" },
    ],
  }),
]

export function roleBySlug(slug: string | undefined | null) {
  return ROLE_OPTIONS.find((r) => r.slug === slug) ?? null
}
