/**
 * Photography for marketing + auth surfaces — FixAm's own Ghanaian set, served
 * from /public/images as WebP at a few widths (originals live in docs/images).
 * To add one: export it as public/images/<slug>-<width>.webp and list it here.
 */
export type Photo = {
  /** File stem in /public/images, e.g. "parts-shop" → parts-shop-1280.webp */
  slug: string
  /** Widths exported for this photo, smallest first. */
  widths: number[]
  alt: string
  /** Optional credit line; nothing is shown when empty. */
  credit?: string
  href?: string
  /** CSS object-position, e.g. "center 40%" */
  position?: string
}

const WIDE = [640, 1280, 1920]

export const photos = {
  /** Two mechanics working on an engine in an open-air workshop. */
  accraWorkshop: { slug: "mechanics-team", widths: WIDE, alt: "Two mechanics working on a car engine at a Ghanaian workshop", position: "center 45%" },
  /** Mechanic leaning into an engine bay. */
  mechanicEngine: { slug: "mechanic-under-hood", widths: WIDE, alt: "Mechanic leaning into a car's engine bay with a spanner", position: "center 35%" },
  /** Driver smiling at a message on her phone. */
  oilChange: { slug: "driver-phone", widths: WIDE, alt: "A driver in Accra smiling at a message on her phone", position: "center 30%" },
  /** Mechanic showing a customer the job on a tablet, in the bay. */
  suvGarage: { slug: "workshop-handover", widths: WIDE, alt: "Mechanic showing a customer the repair on a tablet beside her car", position: "center 40%" },
  /** Roadside workshop street scene. */
  accraCity: { slug: "roadside-workshop", widths: WIDE, alt: "Mechanics at a roadside workshop in Ghana", position: "center 45%" },
  /** Mechanic and customer reviewing the job together. */
  accraStreet: { slug: "mechanic-customer-tablet", widths: WIDE, alt: "Mechanic and customer reviewing a job on a tablet at the garage", position: "center 40%" },

  partsShop: { slug: "parts-shop", widths: WIDE, alt: "Customers buying car parts at a spare-parts shop in Ghana", position: "center 40%" },
  engineRebuild: { slug: "engine-rebuild", widths: WIDE, alt: "Hands rebuilding an engine cylinder head on a workbench" },
  driverTracker: { slug: "driver-tracker", widths: WIDE, alt: "A driver checking his car's repair status on the FixAm tracker", position: "center 35%" },
  insuranceOffice: { slug: "insurance-office", widths: WIDE, alt: "An insurance broker advising a couple at her office in Accra", position: "center 40%" },
  insuranceSigning: { slug: "insurance-signing", widths: WIDE, alt: "Signing a car insurance policy at a broker's desk" },
  engineYard: { slug: "engine-yard", widths: WIDE, alt: "Used engines and parts at a spare-parts yard", position: "center 40%" },
  technicianTablet: { slug: "technician-tablet", widths: WIDE, alt: "Smiling technician holding a tablet in a modern workshop", position: "center 30%" },
  mechanicSmiling: { slug: "mechanic-smiling", widths: [640], alt: "Smiling mechanic holding a wrench in his workshop" },
  mechanicDiagnostic: { slug: "mechanic-diagnostic", widths: [640], alt: "Mechanic reading a diagnostic scanner under the bonnet" },
} satisfies Record<string, Photo>

/** Rotating backgrounds for the home page hero. */
export const heroSlides: Photo[] = [
  photos.accraWorkshop,
  photos.partsShop,
  photos.suvGarage,
  photos.accraCity,
  photos.technicianTablet,
]

/** URL for the smallest exported width that is at least `width` (else the largest). */
export function photoUrl(p: Photo, width = 1600, _quality?: number) {
  void _quality
  const w = p.widths.find((x) => x >= width) ?? p.widths[p.widths.length - 1]!
  return `/images/${p.slug}-${w}.webp`
}

/** srcSet string for responsive <img>. */
export function photoSrcSet(p: Photo) {
  return p.widths.map((w) => `/images/${p.slug}-${w}.webp ${w}w`).join(", ")
}
