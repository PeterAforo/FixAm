import { describe, expect, it } from "vitest"
import { getTemplate, renderBody, renderTemplate, templateKeys } from "./templates"

describe("message templates", () => {
  it("loads all 46 spec templates", () => {
    expect(templateKeys()).toHaveLength(46)
    expect(templateKeys()).toContain("otp")
    expect(templateKeys()).toContain("oil_due")
  })

  it("renders {{variables}}", () => {
    expect(renderBody("Hi {{customer_first_name}}, plate {{plate}}", {
      customer_first_name: "Ama",
      plate: "GR-1234-24",
    })).toBe("Hi Ama, plate GR-1234-24")
  })

  it("renders sms channel content", () => {
    const r = renderTemplate("otp", "sms", { otp_code: "123456", garage_name: "Pitstop" })
    expect(r.body).toContain("123456")
    expect(r.body).toContain("Pitstop")
  })

  it("renders whatsapp template name + params", () => {
    const r = renderTemplate("otp", "whatsapp", { otp_code: "654321" })
    expect(r.whatsappTemplateName).toBe("otp_code")
    expect(r.whatsappParams).toEqual(["654321"])
  })

  it("throws on unknown template", () => {
    expect(() => renderTemplate("nope", "sms", {})).toThrow()
  })

  it("getTemplate returns spec shape", () => {
    const t = getTemplate("job_ready")
    expect(t?.category).toBeTruthy()
    expect(t?.channels.sms?.body ?? t?.channels.whatsapp).toBeTruthy()
  })
})
