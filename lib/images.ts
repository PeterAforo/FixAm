/**
 * Curated photography for marketing + auth surfaces.
 * All photos are free under the Unsplash License (no Unsplash+ / paid images).
 * Served straight from the Unsplash CDN — swap `id` for your own garage photos later.
 */
export type Photo = {
  id: string
  alt: string
  credit: string
  href: string
  /** CSS object-position, e.g. "center 40%" */
  position?: string
}

export const photos = {
  /** Service bay with a car, Accra, Ghana — Maxx Sas */
  accraWorkshop: {
    id: "photo-1730453075684-2ad6232ab451",
    alt: "A car in a service bay at a garage in Accra",
    credit: "Maxx Sas",
    href: "https://unsplash.com/photos/Wi0UCLsvShA",
    position: "center 55%",
  },
  /** Mechanic leaning into an engine bay — Dextar Studio */
  mechanicEngine: {
    id: "photo-1771340012319-0b4fca008b54",
    alt: "Mechanic working on a car engine in a workshop",
    credit: "Dextar Studio",
    href: "https://unsplash.com/photos/XP8o9_Arwqg",
  },
  /** Oil change under the car — Jimmy Nilsson Masth */
  oilChange: {
    id: "photo-1643700973089-baa86a1ab9ee",
    alt: "A mechanic changing the oil in a car",
    credit: "Jimmy Nilsson Masth",
    href: "https://unsplash.com/photos/jL9zfzTVSwY",
  },
  /** Black SUV on a lift in a garage — Kate Ibragimova */
  suvGarage: {
    id: "photo-1625047509168-a7026f36de04",
    alt: "A black SUV inside a repair garage",
    credit: "Kate Ibragimova",
    href: "https://unsplash.com/photos/iFQpqbLMOFU",
  },
  /** Accra skyline — Barnabas Lartey-Odoi Tetteh */
  accraCity: {
    id: "photo-1718766304636-cb9309953a55",
    alt: "View over Accra, Ghana",
    credit: "Barnabas Lartey-Odoi Tetteh",
    href: "https://unsplash.com/photos/5YdLNHzwux4",
  },
  /** Rush hour street in Dzorwulu, Accra — Langford Kwabena */
  accraStreet: {
    id: "photo-1724428533592-df1c672429ea",
    alt: "People walking beside cars on a street in Accra",
    credit: "Langford Kwabena",
    href: "https://unsplash.com/photos/InxdRCIzcNo",
  },
} satisfies Record<string, Photo>

/** Build a sized CDN URL for a photo. */
export function photoUrl(p: Photo, width = 1600, quality = 75) {
  return `https://images.unsplash.com/${p.id}?auto=format&fit=crop&w=${width}&q=${quality}`
}

/** srcSet string for responsive <img>. */
export function photoSrcSet(p: Photo, widths = [640, 960, 1280, 1600, 2000]) {
  return widths.map((w) => `${photoUrl(p, w)} ${w}w`).join(", ")
}
