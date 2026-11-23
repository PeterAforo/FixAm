import { describe, expect, it } from "vitest"
import { parseVendorProductsCsv } from "./csv"

describe("vendor CSV — part type & fitment columns (P8-01)", () => {
  it("parses part type, condition aliases and fitment", () => {
    const csv = [
      "sku,name,category,price,part type,condition,fits make,fits model,year from,year to,oem number,warranty days",
      "BP-1,Front pads,Brakes,250,front-brake-pads,OEM,Toyota,Corolla,2008,2018,04465-02220,90",
      "BP-2,Used pads,Brakes,120,Front brake pads,tokunbo,,,,,,",
    ].join("\n")
    const { rows, issues } = parseVendorProductsCsv(csv)
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({
      partType: "front-brake-pads", condition: "genuine", fitMake: "Toyota", fitModel: "Corolla",
      fitYearFrom: 2008, fitYearTo: 2018, oemNumber: "04465-02220", warrantyDays: 90,
    })
    expect(rows[1]).toMatchObject({ partType: "Front brake pads", condition: "home_used" })
  })

  it("rejects an unknown condition", () => {
    const { rows, issues } = parseVendorProductsCsv("sku,name,category,price,condition\nX,Thing,Misc,10,shiny")
    expect(rows).toHaveLength(0)
    expect(issues[0]?.message).toMatch(/condition/)
  })
})
