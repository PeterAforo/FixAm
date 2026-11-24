"use client"

import { SunDim, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { Button } from "./button"

const ORDER = ["light", "dark", "sunlight"] as const
type ThemeName = (typeof ORDER)[number]

const META: Record<ThemeName, { label: string; next: ThemeName; Icon: typeof Sun }> = {
  light: { label: "Front office", next: "dark", Icon: Moon },
  dark: { label: "Workshop", next: "sunlight", Icon: Sun },
  sunlight: { label: "Sunlight", next: "light", Icon: SunDim },
}

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const current = (ORDER as readonly string[]).includes(resolvedTheme ?? "")
    ? (resolvedTheme as ThemeName)
    : "light"
  const meta = META[current]
  const Icon = meta.Icon

  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 min-w-11 px-3"
      aria-label={`Theme: ${meta.label} — switch to ${META[meta.next].label}`}
      title={mounted ? `${meta.label} theme — switch to ${META[meta.next].label}` : "Change theme"}
      onClick={() => setTheme(meta.next)}
    >
      {mounted ? <Icon /> : <SunDim />}
    </Button>
  )
}
