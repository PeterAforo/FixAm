import { Suspense } from "react"
import { connection } from "next/server"
import { RolePicker } from "./role-picker"
import { loadOnboarding } from "./load"

export const metadata = { title: "Set up FixAm" }

async function Picker() {
  await connection()
  const ctx = await loadOnboarding("/signup")
  return (
    <RolePicker
      needsName={!ctx.name}
      existing={ctx.workspaces.map((w) => ({ type: w.type, href: w.href, name: w.name }))}
      hasWorkspaces={ctx.workspaces.length > 0}
    />
  )
}

/** Signed-in role chooser: first-time setup, or "Add a workspace". */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="h-dvh bg-background" />}>
      <Picker />
    </Suspense>
  )
}
