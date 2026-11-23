"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { PartPhotoScanner } from "@/components/part-photo/part-photo-scanner"

/** P8-12: "Don't know the name? Snap it" — picking a part shows offers that fit the car. */
export function PhotoFinder({ vehicle, allParts }: { vehicle?: string; allParts: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <Card className="mt-6">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Don&apos;t know what the part is called?</p>
            <p className="text-xs text-muted-foreground">Take a photo of the old part — we&apos;ll work out what it is and show sellers who have it.</p>
          </div>
          {!open && <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setOpen(true)}>Use a photo</button>}
        </div>
        {open && (
          <div className="mt-3">
            <PartPhotoScanner vehicle={vehicle} allParts={allParts} onPicked={(p) => { setOpen(false); router.push(`/portal/parts?part=${p.id}`) }} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
