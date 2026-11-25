import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FixAm — Garage OS",
    short_name: "FixAm",
    description: "Repairs, parts, reminders and money for Ghanaian garages.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF6EC",
    theme_color: "#FF5A1F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
