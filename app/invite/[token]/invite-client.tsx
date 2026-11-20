"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { acceptInvite } from "@/lib/staff/actions"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/brand/card"
import { Wrench } from "lucide-react"

type State =
  | { kind: "working" }
  | { kind: "done"; garageSlug: string }
  | { kind: "error"; message: string }
  | { kind: "signed-out" }

export function InviteClient({ token }: { token: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: "working" })

  useEffect(() => {
    let cancelled = false
    acceptInvite(token).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState({ kind: "done", garageSlug: result.data.garageSlug })
        setTimeout(() => {
          router.push(`/g/${result.data.garageSlug}`)
          router.refresh()
        }, 1500)
      } else if (result.error.code === "UNAUTHENTICATED") {
        setState({ kind: "signed-out" })
      } else {
        setState({ kind: "error", message: result.error.message })
      }
    })
    return () => {
      cancelled = true
    }
  }, [token, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-14 items-center justify-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-chunky-sm">
            <Wrench className="size-7" />
          </span>
          <CardTitle className="text-2xl">FixAm invite</CardTitle>
          <CardDescription>
            {state.kind === "working" && "Accepting your invite…"}
            {state.kind === "done" && "You're in! Taking you to the garage…"}
            {state.kind === "signed-out" && "Sign in with the phone or email this invite was sent to."}
            {state.kind === "error" && state.message}
          </CardDescription>
        </CardHeader>
        {state.kind === "signed-out" && (
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/login?next=/invite/${token}`}>Sign in to accept</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  )
}
