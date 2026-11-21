import { test, expect } from "@playwright/test"

/**
 * Authenticated acceptance flows. Requires a seeded environment:
 *   PLAYWRIGHT_BASE_URL, PLAYWRIGHT_EMAIL, PLAYWRIGHT_PASSWORD, PLAYWRIGHT_GARAGE_SLUG
 * Skips cleanly when credentials are not configured (CI smoke runs public tests only).
 */
const email = process.env.PLAYWRIGHT_EMAIL
const password = process.env.PLAYWRIGHT_PASSWORD
const slug = process.env.PLAYWRIGHT_GARAGE_SLUG ?? "demo-garage"

test.describe("authenticated garage flows", () => {
  test.skip(!email || !password, "PLAYWRIGHT_EMAIL/PASSWORD not configured")

  test("owner can sign in and reach the dashboard", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel(/email/i).fill(email!)
    await page.getByLabel(/password/i).fill(password!)
    await page.getByRole("button", { name: /sign in|log in/i }).click()
    await page.waitForURL(new RegExp(`/g/${slug}`), { timeout: 15_000 })
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  test("job board renders for signed-in staff", async ({ page }) => {
    test.skip(!email || !password, "credentials not configured")
    await page.goto("/login")
    await page.getByLabel(/email/i).fill(email!)
    await page.getByLabel(/password/i).fill(password!)
    await page.getByRole("button", { name: /sign in|log in/i }).click()
    await page.waitForURL(/\/g\//, { timeout: 15_000 })
    await page.goto(`/g/${slug}/jobs`)
    await expect(page.locator("body")).not.toContainText("Application error")
  })
})
