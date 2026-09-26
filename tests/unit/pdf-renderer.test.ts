import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("server PDF renderer", () => {
  it("installs the browser build that the app's playwright version expects", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>
      dependencies?: Record<string, string>
    }
    const version = pkg.dependencies?.playwright ?? pkg.devDependencies?.playwright
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8")
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(dockerfile).toContain(`ARG PLAYWRIGHT_VERSION=${version}`)
    expect(dockerfile).toContain("install --with-deps --only-shell chromium")
  })

  it("ships all of playwright with the server build, not just its entry file", () => {
    const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8")
    expect(config).toContain("playwright@*/node_modules/playwright/**/*")
    expect(config).toContain("playwright-core@*/node_modules/playwright-core/**/*")
  })
})
