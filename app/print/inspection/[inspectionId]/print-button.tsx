"use client"

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-neutral-400 px-4 py-2 text-sm font-semibold print:hidden"
    >
      Print / save PDF
    </button>
  )
}
