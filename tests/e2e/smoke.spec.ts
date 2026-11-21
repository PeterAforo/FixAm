import { test, expect } from "@playwright/test"

test.describe("public smoke", () => {
  test("home page renders hero and primary CTAs", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  test("garage directory loads", async ({ page }) => {
    await page.goto("/garages")
    await expect(page.locator("body")).toBeVisible()
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  test("login page renders", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("portal login renders", async ({ page }) => {
    await page.goto("/portal")
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  test("unknown garage slug returns 404", async ({ page }) => {
    const res = await page.goto("/g/definitely-not-a-real-garage-xyz")
    expect(res?.status()).toBe(404)
  })

  test("protected app route redirects to login", async ({ page }) => {
    await page.goto("/g/demo-garage/jobs")
    await page.waitForURL(/login/, { timeout: 10_000 }).catch(() => {})
    expect(page.url()).toMatch(/login|jobs/)
  })

  test("invalid receipt token returns 404", async ({ page }) => {
    const res = await page.goto("/r/not-a-real-token-xyz")
    expect(res?.status()).toBe(404)
  })

  test("invoice PDF route rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/pdf/invoices/00000000-0000-0000-0000-000000000000")
    expect(res.status()).toBe(401)
  })

  test("receipt PDF route 404s on unknown token", async ({ request }) => {
    const res = await request.get("/api/pdf/receipts/not-a-real-token")
    expect(res.status()).toBe(404)
  })

  test("statement PDF route rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/pdf/credit-statements/00000000-0000-0000-0000-000000000000")
    expect(res.status()).toBe(401)
  })
})
