"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { ObdScanner } from "@/components/obd/obd-scanner"

/** P8-13: drivers with their own Bluetooth OBD adapter can read and understand fault codes. */
export function DriverScanCard({ vehicleId }: { vehicleId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Check-engine light on?</p>
            <h2 className="mt-0.5 font-display text-lg font-semibold">Read your car&apos;s fault codes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              With a Bluetooth (BLE) OBD adapter from a parts shop, FixAm reads the codes, explains them in plain English and shows the likely parts.
            </p>
          </div>
          {!open && <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setOpen(true)}>Scan my car</button>}
        </div>
        {open && <div className="mt-4"><ObdScanner ctx={{ kind: "driver", vehicleId }} /></div>}
      </CardContent>
    </Card>
  )
}
