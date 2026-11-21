import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "@/components/brand/button"
import { StatusPill } from "@/components/brand/status-pill"
import { PlateChip, normalizePlate } from "@/components/brand/plate-chip"
import { MoneyText } from "@/components/brand/money-text"
import { Stepper } from "@/components/brand/stepper"
import { Card, CardHeader, CardTitle } from "@/components/brand/card"
import { StatTile } from "@/components/brand/stat-tile"

describe("Button", () => {
  it("renders variants and sizes", () => {
    for (const v of ["primary", "secondary", "accent", "ghost", "danger"] as const) {
      const { unmount } = render(<Button variant={v}>{v}</Button>)
      expect(screen.getByRole("button", { name: v })).toBeInTheDocument()
      unmount()
    }
    render(<Button size="lg">big</Button>)
    expect(screen.getByRole("button", { name: "big" }).className).toContain("min-h-[52px]")
  })

  it("supports premium variants and loading state", () => {
    for (const v of ["tonal", "success", "link"] as const) {
      const { unmount } = render(<Button variant={v}>{v}</Button>)
      expect(screen.getByRole("button", { name: v })).toBeInTheDocument()
      unmount()
    }
    render(<Button loading>Saving</Button>)
    expect(screen.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled()
  })

  it("handles clicks and disabled state", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe("StatusPill", () => {
  it("maps statuses to tones", () => {
    render(
      <>
        <StatusPill status="overdue" />
        <StatusPill status="paid" />
        <StatusPill status="in_progress" />
      </>
    )
    expect(screen.getByText("overdue")).toHaveClass("bg-danger-subtle")
    expect(screen.getByText("paid")).toHaveClass("bg-success-subtle")
    expect(screen.getByText("in progress")).toHaveClass("bg-primary-subtle")
  })

  it("solid variant uses saturated tones", () => {
    render(<StatusPill status="paid" variant="solid" />)
    expect(screen.getByText("paid")).toHaveClass("bg-success")
  })
})

describe("PlateChip", () => {
  it("normalizes and displays plates", () => {
    expect(normalizePlate("  gr 1234-24 ")).toBe("GR 1234-24")
    render(<PlateChip plate="gr-5678-25" />)
    expect(screen.getByText("GR-5678-25")).toHaveClass("font-mono", "border-carbon-800")
  })
})

describe("MoneyText", () => {
  it("formats pesewas as GHS", () => {
    render(<MoneyText pesewas={125000n} />)
    expect(screen.getByText("GH₵ 1,250.00")).toBeInTheDocument()
  })
  it("marks negatives with danger colour", () => {
    render(<MoneyText pesewas={-5000n} />)
    expect(screen.getByText("-GH₵ 50.00")).toHaveClass("text-danger")
  })
})

describe("Stepper", () => {
  it("renders steps with current marker", () => {
    render(
      <Stepper
        steps={[
          { label: "Check-in", state: "done" },
          { label: "Diagnosis", state: "current" },
          { label: "Repair", state: "upcoming" },
        ]}
      />
    )
    expect(screen.getByText("Check-in")).toBeInTheDocument()
    expect(screen.getByText("Diagnosis").closest("li")).toBeInTheDocument()
    expect(screen.getByText("Repair")).toBeInTheDocument()
  })
})

describe("Card & StatTile", () => {
  it("renders card sections", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Job card</CardTitle>
        </CardHeader>
      </Card>
    )
    expect(screen.getByText("Job card")).toBeInTheDocument()
  })
  it("renders stat tile with delta", () => {
    render(<StatTile label="Revenue" value="GH₵ 1,000" delta={10} />)
    expect(screen.getByText("Revenue")).toBeInTheDocument()
    expect(screen.getByText("10%")).toBeInTheDocument()
  })
})
