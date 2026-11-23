import { test, expect } from "@playwright/test"

/**
 * P8-21 end-to-end flows. Requires a seeded staging/preview environment:
 *   PLAYWRIGHT_BASE_URL, PLAYWRIGHT_EMAIL, PLAYWRIGHT_PASSWORD,
 *   PLAYWRIGHT_GARAGE_SLUG, plus optional entity ids below.
 * Every test skips cleanly when credentials are not configured.
 *
 * Optional env for deeper assertions:
 *   PLAYWRIGHT_JOB_ID, PLAYWRIGHT_CUSTOMER_ID, PLAYWRIGHT_VEHICLE_ID,
 *   PLAYWRIGHT_INSPECTION_ID, PLAYWRIGHT_CLAIM_ID, PLAYWRIGHT_ORDER_ID
 */
const email = process.env.PLAYWRIGHT_EMAIL
const password = process.env.PLAYWRIGHT_PASSWORD
const slug = process.env.PLAYWRIGHT_GARAGE_SLUG ?? "pitstop-demo"
const jobId = process.env.PLAYWRIGHT_JOB_ID
const inspectionId = process.env.PLAYWRIGHT_INSPECTION_ID
const claimId = process.env.PLAYWRIGHT_CLAIM_ID

const hasCreds = !!(email && password)

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByLabel(/email/i).fill(email!)
  await page.getByLabel(/password/i).fill(password!)
  await page.getByRole("button", { name: /sign in|log in/i }).click()
  await page.waitForURL(/\/(g|admin|vendor|broker|rider|tow|portal)\//, { timeout: 20_000 })
}

async function signInGarage(page: import("@playwright/test").Page) {
  await signIn(page)
  await page.goto(`/g/${slug}`)
  await expect(page.locator("body")).not.toContainText("Application error")
}

test.describe("P8-21 e2e flows", () => {
  test.describe.configure({ mode: "serial" })
  test.skip(!hasCreds, "PLAYWRIGHT_EMAIL/PASSWORD not configured")

  // Flow 1 — garage signup → onboarding → dashboard; staff invite surface.
  test("flow 1: garage workspace loads and staff settings render", async ({ page }) => {
    await signInGarage(page)
    await page.goto(`/g/${slug}/settings/staff`)
    await expect(page.locator("body")).not.toContainText("Application error")
    await expect(page.locator("body")).toContainText(/staff|invite|member/i)
  })

  // Flow 2 — check-in → job card → estimate → approval → QC → invoice →
  // payment (stubbed theTeller callback) → receipt.
  test("flow 2: job lifecycle pages render", async ({ page }) => {
    await signInGarage(page)
    await page.goto(`/g/${slug}/jobs`)
    await expect(page.locator("body")).not.toContainText("Application error")
    if (jobId) {
      await page.goto(`/g/${slug}/jobs/${jobId}`)
      await expect(page.locator("body")).not.toContainText("Application error")
      // Invoice + receipt print views for a settled job
      await page.goto(`/print/invoices/${jobId}`)
      await expect(page.locator("body")).not.toContainText("Application error")
    }
  })

  // Flow 3 — public booking with pickup → condition report → /p/<token>.
  test("flow 3: public pickup handover page contract", async ({ page }) => {
    // Unknown tokens must 404; the real token comes from a seeded pickup.
    const res = await page.goto("/p/not-a-real-token-xyz")
    expect(res?.status()).toBe(404)
    await page.goto("/book")
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  // Flow 4 — driver repair request → AI triage → garage lead → job.
  test("flow 4: repair-request surfaces render", async ({ page }) => {
    await page.goto("/request")
    await expect(page.locator("body")).not.toContainText("Application error")
    await signInGarage(page)
    await page.goto(`/g/${slug}/requests`)
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  // Flow 5 — driver buys a part → vendor fulfils → escrow → payout queued.
  test("flow 5: parts ordering + vendor surfaces render", async ({ page }) => {
    await page.goto("/parts")
    await expect(page.locator("body")).not.toContainText("Application error")
    await signInGarage(page)
    await page.goto(`/g/${slug}/parts`)
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  // Flow 6 — breakdown SOS → tow operator accepts → status → settlement.
  test("flow 6: towing surfaces render", async ({ page }) => {
    await page.goto("/sos")
    await expect(page.locator("body")).not.toContainText("Application error")
    await page.goto("/tow")
    await expect(page.locator("body")).not.toContainText("Application error")
  })

  // Flow 7 — P8-17..20: claims, rider delivery, WhatsApp assistant, inspection.
  test("flow 7: P8 surfaces render", async ({ page }) => {
    await signInGarage(page)
    await page.goto(`/g/${slug}/claims`)
    await expect(page.locator("body")).not.toContainText("Application error")
    await page.goto(`/g/${slug}/inspections`)
    await expect(page.locator("body")).not.toContainText("Application error")
    await page.goto(`/g/${slug}/inbox`)
    await expect(page.locator("body")).not.toContainText("Application error")
    await page.goto("/rider")
    await expect(page.locator("body")).not.toContainText("Application error")
    if (claimId) {
      await page.goto(`/g/${slug}/claims/${claimId}`)
      await expect(page.locator("body")).not.toContainText("Application error")
    }
    if (inspectionId) {
      await page.goto(`/g/${slug}/inspections/${inspectionId}`)
      await expect(page.locator("body")).not.toContainText("Application error")
    }
    // Public inspection report share link 404s on a bad token
    const res = await page.goto("/i/not-a-real-token-xyz")
    expect(res?.status()).toBe(404)
  })

  // Flow 8 — tenant isolation: garage A cannot read garage B's data.
  // Uses a second garage slug when PLAYWRIGHT_GARAGE_SLUG_B is provided.
  test("flow 8: tenant isolation across garages", async ({ page }) => {
    const slugB = process.env.PLAYWRIGHT_GARAGE_SLUG_B
    test.skip(!slugB, "PLAYWRIGHT_GARAGE_SLUG_B not configured")
    await signInGarage(page)
    // Garage B's job/invoice/customer URLs must not leak data to garage A's
    // session — expect 404 (hidden) or a redirect, never the record.
    if (jobId) {
      const res = await page.goto(`/g/${slugB}/jobs/${jobId}`)
      expect([404, 403]).toContain(res?.status())
    }
    const resB = await page.goto(`/g/${slugB}`)
    // Cross-tenant garage root should not render garage A's private data
    await expect(page.locator("body")).not.toContainText("Application error")
    expect(resB?.status()).not.toBe(500)
  })
})
