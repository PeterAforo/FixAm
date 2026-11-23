"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { confirmSeasonalOptOut } from "@/lib/seasonal/actions"

/**
 * One tap to stop (link previews and scanners don't opt people out —
 * only the button does). Undo is offered straight away.
 */
export function OptOutPanel({ token, garageName, initiallyOptedOut }: { token: string; garageName: string; initiallyOptedOut: boolean }) {
  const [optedOut, setOptedOut] = useState(initiallyOptedOut)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = (v: boolean) => start(async () => {
    setErr(null)
    const r = await confirmSeasonalOptOut({ token, optOut: v })
    if (r.ok) setOptedOut(r.data.optedOut)
    else setErr(r.error.message)
  })

  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">{garageName}</p>
      {optedOut ? (
        <>
          <h1 className="mt-2 font-display text-2xl font-bold">You won&apos;t get seasonal tips</h1>
          <p className="mt-2 text-sm text-muted-foreground">No more harmattan or rainy-season messages from {garageName}. You&apos;ll still get reminders you asked for, like service due dates.</p>
          <Button className="mt-5 w-full" variant="secondary" disabled={pending} onClick={() => set(false)}>Undo — keep sending them</Button>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-2xl font-bold">Stop seasonal car-care tips?</h1>
          <p className="mt-2 text-sm text-muted-foreground">{garageName} sends a short checklist when harmattan and the rains arrive — a few messages a year.</p>
          <Button className="mt-5 w-full" variant="danger" disabled={pending} onClick={() => set(true)}>Stop these messages</Button>
        </>
      )}
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
    </div>
  )
}
