// One-off click-through: sign in as demo owner, walk every sidebar link,
// report HTTP errors, console errors and pageerrors per route.
import { chromium } from "@playwright/test"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

const browser = await chromium.launch()
const page = await browser.newPage()

const problems = []
page.on("pageerror", (e) => problems.push(`[pageerror ${page.url()}] ${e.message}`))
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`[console ${page.url()}] ${m.text()}`)
})
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`[http ${r.status()} ${page.url()}] ${r.url()}`)
})

await page.goto(`${BASE}/login`)
await page.getByLabel(/email/i).fill("owner@pitstop-demo.test")
await page.getByLabel(/password/i).fill("Password123!")
await page.getByRole("button", { name: /sign in/i }).click()
await page.waitForURL(/\/g\//, { timeout: 90000 })
console.log("signed in ->", page.url())
await page.waitForSelector('aside nav a[href^="/g/"]', { timeout: 60000 })
await page.waitForTimeout(1000)

// Collect sidebar links (desktop nav), plus subnav items.
const links = await page.locator('aside nav a[href^="/g/"]').evaluateAll((els) =>
  [...new Set(els.map((a) => a.getAttribute("href")))]
)
// Sub-nav + deep links not present until their parent section is active
links.push(
  "/g/pitstop-demo/check-in",
  "/g/pitstop-demo/purchase-orders",
  "/g/pitstop-demo/credit",
  "/g/pitstop-demo/expenses",
  "/g/pitstop-demo/settings",
  "/g/pitstop-demo/settings/staff",
  "/g/pitstop-demo/settings/templates",
  "/g/pitstop-demo/my-jobs",
  "/g/pitstop-demo/my-stats",
)
console.log("sidebar links:", links.length)

for (const href of links) {
  problems.length = 0
  try {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(800)
    const title = await page.title()
    const errText = await page.locator("text=/Application error|client-side exception/i").count()
    const status = errText > 0 ? "RENDER-ERROR" : "ok"
    console.log(`${status.padEnd(13)} ${href}  (${title})`)
  } catch (e) {
    console.log(`NAV-FAIL      ${href}  ${e.message.split("\n")[0]}`)
  }
  for (const p of problems) console.log(`   ${p}`)
}

await browser.close()
