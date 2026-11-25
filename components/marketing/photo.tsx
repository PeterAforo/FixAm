import { cn } from "@/lib/utils"
import { photoSrcSet, photoUrl, type Photo } from "@/lib/images"

/** Responsive photo from the curated library. Fills its (relative) parent when `fill` is set. */
export function PhotoImg({
  photo,
  className,
  sizes = "100vw",
  priority,
  fill,
}: {
  photo: Photo
  className?: string
  sizes?: string
  priority?: boolean
  fill?: boolean
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl(photo, 1600)}
      srcSet={photoSrcSet(photo)}
      sizes={sizes}
      alt={photo.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      style={photo.position ? { objectPosition: photo.position } : undefined}
      className={cn("object-cover", fill && "absolute inset-0 size-full", className)}
    />
  )
}

/** Optional photo credit — renders nothing for FixAm's own photos. */
export function PhotoCredit({ photo, className }: { photo: Photo; className?: string }) {
  if (!photo.credit) return null
  return (
    <a
      href={photo.href}
      target="_blank"
      rel="noreferrer"
      className={cn("text-[11px] text-white/45 transition-colors hover:text-white/80", className)}
    >
      Photo: {photo.credit}
    </a>
  )
}
