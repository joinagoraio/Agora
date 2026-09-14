import { test, expect, type Page } from "@playwright/test"

const requiredEnvVars = ["E2E_BASE_URL", "E2E_TEST_EMAIL", "E2E_TEST_PASSWORD", "E2E_WORKSPACE_PATH"]
const missingEnv = requiredEnvVars.filter((key) => !process.env[key])
const shouldRunE2E = missingEnv.length === 0

async function login(page: Page, baseUrl: string, email: string, password: string) {
  await page.goto(`${baseUrl}/auth/login`)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /sign in/i }).click()
  await expect(page).toHaveURL(/dashboard|workspaces|spaces/, { timeout: 30000 })
}

test.describe(shouldRunE2E ? "Critical user flows" : "Critical user flows (skipped)", () => {
  test.skip(!shouldRunE2E, `Missing E2E env vars: ${missingEnv.join(", ") || "none"}`)

  const baseUrl = process.env.E2E_BASE_URL!
  const testEmail = process.env.E2E_TEST_EMAIL!
  const testPassword = process.env.E2E_TEST_PASSWORD!
  const workspacePath = process.env.E2E_WORKSPACE_PATH!

  test("health check endpoints are accessible", async ({ page }) => {
    const liveResponse = await page.request.get(`${baseUrl}/api/health/live`)
    expect(liveResponse.status()).toBe(200)
    const liveData = await liveResponse.json()
    expect(liveData.status).toBe("alive")

    const readyResponse = await page.request.get(`${baseUrl}/api/health/ready`)
    expect([200, 503]).toContain(readyResponse.status())
    const readyData = await readyResponse.json()
    expect(readyData.status).toBeDefined()

    const healthResponse = await page.request.get(`${baseUrl}/api/health`)
    expect([200, 503]).toContain(healthResponse.status())
    const healthData = await healthResponse.json()
    expect(healthData.status).toBeDefined()
    expect(healthData.checks).toBeDefined()
  })

  test("API returns proper error responses", async ({ page }) => {
    const notFoundResponse = await page.request.get(`${baseUrl}/api/nonexistent`)
    expect(notFoundResponse.status()).toBe(404)

    const unauthorizedResponse = await page.request.post(`${baseUrl}/api/documents/upload`, {
      data: {},
    })
    expect([401, 403, 400]).toContain(unauthorizedResponse.status())
  })

  test("user can login and open workspace", async ({ page }) => {
    await login(page, baseUrl, testEmail, testPassword)
    await page.goto(`${baseUrl}${workspacePath}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 })
    await expect(page).toHaveURL(/\/programme/)
  })

  test("programme workbench journey: setup → analysis → measures → export", async ({ page }) => {
    await login(page, baseUrl, testEmail, testPassword)

    await page.goto(`${baseUrl}${workspacePath}/programme?section=setup`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("tablist", { name: /programme sections|programmasecties/i })).toBeVisible()

    for (const section of ["analysis", "measures", "review", "export"] as const) {
      await page.goto(`${baseUrl}${workspacePath}/programme?section=${section}`)
      await expect(page.getByRole("tab", { selected: true })).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`section=${section}`))
    }

    await page.goto(`${baseUrl}${workspacePath}/programme?section=review`)
    await expect(page.getByText(/distinct reviewer|andere reviewer/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /add local reviewer|lokale reviewer/i })).toBeVisible()

    await page.goto(`${baseUrl}${workspacePath}/programme?section=export`)
    await expect(page.getByRole("button", { name: /docx/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /markdown/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /pdf|print/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /cancel fill|annuleer vullen/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /retry remaining|resterende hoofdstukken/i })).toBeVisible()
  })

  test("guided programme shows the document without opening a sheet", async ({ page }) => {
    await login(page, baseUrl, testEmail, testPassword)
    await page.goto(`${baseUrl}${workspacePath}/programme`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 })
    await expect(page).toHaveURL(/\/programme/)
    await expect(page).not.toHaveURL(/[?&]section=/)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
})
