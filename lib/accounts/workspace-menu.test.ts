import { describe, expect, it } from "vitest"
import { rankWorkspaces, switchHref, workspaceMenu } from "./workspace-menu"
import type { Workspace } from "./workspaces"

const ws = (type: Workspace["type"], key: string, role?: string): Workspace => ({ key, type, name: key, subtitle: "", href: type === "garage" ? `/g/${key}` : `/${type}`, role })

describe("rankWorkspaces", () => {
  it("puts the business before the driver workspace, owners before staff", () => {
    const list = [ws("driver", "driver"), ws("garage", "b", "mechanic"), ws("vendor", "v"), ws("garage", "a", "owner")]
    expect(rankWorkspaces(list).map((w) => w.key)).toEqual(["a", "b", "v", "driver"])
  })
})

describe("workspaceMenu", () => {
  it("filters garage items by the person's role there", () => {
    const owner = workspaceMenu(ws("garage", "pitstop", "owner")).map((m) => m.label)
    const mechanic = workspaceMenu(ws("garage", "pitstop", "mechanic")).map((m) => m.label)
    expect(owner).toContain("Money")
    expect(mechanic).not.toContain("Money")
    expect(workspaceMenu(ws("garage", "pitstop", "owner")).every((m) => m.href.startsWith("/g/pitstop"))).toBe(true)
  })
  it("gives the driver menu for My cars", () => {
    expect(workspaceMenu(ws("driver", "driver"))[0]).toEqual({ label: "Home", href: "/portal" })
  })
})

describe("switchHref", () => {
  it("encodes the key and target", () => {
    expect(switchHref({ ...ws("garage", "pitstop"), key: "garage:pitstop" }, "/g/pitstop/jobs")).toBe("/switch/garage%3Apitstop?to=%2Fg%2Fpitstop%2Fjobs")
  })
})
