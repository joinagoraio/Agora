import { test, expect } from "@playwright/test"

const requiredEnvVars = ["E2E_BASE_URL", "E2E_TEST_EMAIL", "E2E_TEST_PASSWORD", "E2E_WORKSPACE_PATH"]
const missingEnv = requiredEnvVars.filter((key) => !process.env[key])

const shouldRunE2E = missingEnv.length === 0

test.describe(shouldRunE2E ? "Critical user flows" : "Critical user flows (skipped)", () => {
  test.skip(!shouldRunE2E, `Missing E2E env vars: ${missingEnv.join(", ") || "none"}`)

  const baseUrl = process.env.E2E_BASE_URL!
  const testEmail = process.env.E2E_TEST_EMAIL!
  const testPassword = process.env.E2E_TEST_PASSWORD!
  const workspacePath = process.env.E2E_WORKSPACE_PATH!

  test("user can login, upload document, and view chat context", async ({ page }) => {
    await page.goto(`${baseUrl}/login`)
    await page.getByLabel(/email/i).fill(testEmail)
    await page.getByLabel(/password/i).fill(testPassword)
    await page.getByRole("button", { name: /sign in|log in/i }).click()

    await page.goto(`${baseUrl}${workspacePath}`)

    await page.getByRole("button", { name: /upload document/i }).click()
    await page.setInputFiles('input[type="file"]', "tests/fixtures/sample.pdf")
    await page.getByRole("button", { name: /upload/i }).click()
    await expect(page.getByText("sample.pdf")).toBeVisible({ timeout: 60000 })

    await page.getByRole("button", { name: /chat/i }).click()
    await page.getByPlaceholder(/ask/i).fill("Summarize the latest upload")
    await page.getByRole("button", { name: /send/i }).click()
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 60000 })
  })

  test("highlights from chat link to document viewer", async ({ page }) => {
    await page.goto(`${baseUrl}${workspacePath}`)

    await page.getByRole("button", { name: /chat/i }).click()
    await page.getByPlaceholder(/ask/i).fill("Highlight key policy statements")
    await page.getByRole("button", { name: /send/i }).click()
    await expect(page.locator("[data-highlight-ref]")).toBeVisible({ timeout: 60000 })

    await page.getByRole("button", { name: /view document/i }).first().click()
    await expect(page.locator(".word-document-content, canvas")).toBeVisible()
  })

  test("search functionality works", async ({ page }) => {
    await page.goto(`${baseUrl}${workspacePath}`)

    // Look for search input or button
    const searchInput = page.getByPlaceholder(/search/i).first()
    if (await searchInput.isVisible()) {
      await searchInput.fill("test query")
      await page.keyboard.press("Enter")
      // Wait for results or no results message
      await expect(
        page.locator("[data-testid='search-results'], .search-results, .no-results").first()
      ).toBeVisible({ timeout: 10000 })
    }
  })

  test("health check endpoints are accessible", async ({ page }) => {
    // Test liveness endpoint
    const liveResponse = await page.request.get(`${baseUrl}/api/health/live`)
    expect(liveResponse.status()).toBe(200)
    const liveData = await liveResponse.json()
    expect(liveData.status).toBe("alive")

    // Test readiness endpoint
    const readyResponse = await page.request.get(`${baseUrl}/api/health/ready`)
    expect([200, 503]).toContain(readyResponse.status()) // Can be either depending on DB state
    const readyData = await readyResponse.json()
    expect(readyData.status).toBeDefined()

    // Test full health endpoint
    const healthResponse = await page.request.get(`${baseUrl}/api/health`)
    expect([200, 503]).toContain(healthResponse.status())
    const healthData = await healthResponse.json()
    expect(healthData.status).toBeDefined()
    expect(healthData.checks).toBeDefined()
  })

  test("API returns proper error responses", async ({ page }) => {
    // Test 404 for non-existent route
    const notFoundResponse = await page.request.get(`${baseUrl}/api/nonexistent`)
    expect(notFoundResponse.status()).toBe(404)

    // Test unauthorized access (without auth token)
    const unauthorizedResponse = await page.request.post(`${baseUrl}/api/documents/upload`, {
      data: {},
    })
    expect([401, 403, 400]).toContain(unauthorizedResponse.status())
  })
})

