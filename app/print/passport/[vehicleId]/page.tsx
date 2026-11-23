import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalVehicle } from "@/lib/portal/data"
import { getOwnerPassport } from "@/lib/passport/service"
import { qrSvg } from "@/lib/passport/qr"
import { PrintStickerButton } from "./print-button"

export const metadata = { title: "Print passport sticker · FixAm", robots: { index: false } }

function Sticker({ svg, plate, car }: { svg: string; plate: string; car: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-between rounded-2xl border-2 border-neutral-900 bg-white p-4 text-center text-neutral-900 [break-inside:avoid]">
      <div className="w-full">
        <div className="flex items-center justify-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#ce1126]" />
          <span className="inline-block h-2 w-2 rounded-full bg-[#fcd116]" />
          <span className="inline-block h-2 w-2 rounded-full bg-[#006b3f]" />
          <span className="ml-1 text-xs font-bold tracking-wide">FixAm Vehicle Passport</span>
        </div>
        <p className="mt-1 text-[11px] text-neutral-600">Scan to see this car&apos;s service history</p>
      </div>
      <div className="my-2 w-[70%] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <p className="font-mono text-base font-bold tracking-wider">{plate}</p>
        <p className="text-[11px] text-neutral-600">{car}</p>
      </div>
    </div>
  )
}

async function Content({ params }: { params: Promise<{ vehicleId: string }> }) {
  await connection()
  const { vehicleId } = await params
  const phone = await getPortalPhone()
  if (!phone) redirect(`/login`)
  const data = await getPortalVehicle(phone, vehicleId)
  if (!data) notFound()
  const passport = await getOwnerPassport(phone, vehicleId)
  if (!passport) notFound()
  const v = data.vehicle
  const car = [v.year, v.make, v.model].filter(Boolean).join(" ")

  if (!passport.enabled) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Turn the passport on first</h1>
        <p className="mt-2 text-sm text-neutral-600">The sticker links to the passport page, which is switched off right now.</p>
        <Link href={`/portal/vehicles/${vehicleId}`} className="mt-4 inline-block text-sm underline">Back to {v.plateNumber}</Link>
      </main>
    )
  }

  const svg = await qrSvg(passport.url)
  return (
    <main className="mx-auto max-w-[210mm] bg-white p-6 print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <div>
          <Link href={`/portal/vehicles/${vehicleId}`} className="text-sm text-neutral-600 underline">← Back</Link>
          <h1 className="mt-1 text-xl font-semibold">Passport stickers for {v.plateNumber}</h1>
          <p className="text-sm text-neutral-600">Print on sticker paper and cut out. Put one inside the windscreen or in the service booklet.</p>
        </div>
        <PrintStickerButton />
      </div>
      <div className="grid grid-cols-2 gap-[8mm] [&>*]:h-[95mm]">
        {[0, 1, 2, 3].map((i) => <Sticker key={i} svg={svg} plate={v.plateNumber} car={car} />)}
      </div>
      <p className="mt-4 text-center text-[10px] text-neutral-500">{passport.url}</p>
    </main>
  )
}

export default function PassportStickerPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-neutral-500">Preparing stickers…</div>}>
      <Content params={params} />
    </Suspense>
  )
}
