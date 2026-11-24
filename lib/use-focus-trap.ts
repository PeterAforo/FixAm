"use client"

import { useEffect, type RefObject } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Minimal focus trap + Escape-to-close + scroll lock for custom overlays.
 * Attach `ref` to the overlay panel element. Pass `active` when the overlay
 * is toggled inline (`{open && …}`) rather than mounted conditionally.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onClose?: () => void,
  active = true
) {
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      )

    // Focus first focusable (or the panel itself) on open.
    const first = focusables()[0]
    ;(first ?? el).focus?.()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== "Tab") return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]!
      const lastEl = items[items.length - 1]!
      const activeEl = document.activeElement
      if (e.shiftKey && (activeEl === firstEl || !el.contains(activeEl))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && (activeEl === lastEl || !el.contains(activeEl))) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [ref, onClose, active])
}
