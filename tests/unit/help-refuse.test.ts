import { isHelpAiEnabled } from "@/lib/env"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { shouldRefuseHelpQuery } from "@/lib/guidance/help-refuse"
import { HELP_SYSTEM_PROMPT } from "@/lib/guidance/help-corpus"
import { resolveProgrammeLandingSection } from "@/lib/guidance/jobs"

describe("help AI flag", () => {
  it("stays off in production unless explicitly enabled", () => {
    expect(isHelpAiEnabled(undefined, { nodeEnv: "production" })).toBe(false)
    expect(isHelpAiEnabled("true", { nodeEnv: "production" })).toBe(true)
    expect(isHelpAiEnabled("false", { nodeEnv: "development" })).toBe(false)
  })

  it("turns on outside production by default", () => {
    expect(isHelpAiEnabled(undefined, { nodeEnv: "development" })).toBe(true)
    expect(isHelpAiEnabled(undefined, { nodeEnv: "test" })).toBe(true)
  })
})
describe("help refuse classifier", () => {
  it("refuses drafting a chapter without calling an LLM", () => {
    expect(shouldRefuseHelpQuery("write chapter 3")).toBe(true)
    expect(shouldRefuseHelpQuery("schrijf hoofdstuk 3")).toBe(true)
    expect(shouldRefuseHelpQuery("What is the Sources tab for?")).toBe(false)
  })
})

describe("help route isolation", () => {
  it("does not import the playbook compiler or draft path", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/help/route.ts"), "utf8")
    expect(source).not.toMatch(/playbook-compiler/)
    expect(source).not.toMatch(/compileSystemPrompt/)
    expect(source).not.toMatch(/generation_runs/)
    expect(source).toMatch(/completeLlm/)
  })

  it("grounds the help prompt without policy bodies", () => {
    expect(HELP_SYSTEM_PROMPT).toMatch(/titles and roles only/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Never quote or request policy document bodies/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/FORMAT \(code-owned/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Markdown/)
    expect(HELP_SYSTEM_PROMPT).not.toMatch(/<p>/)
  })

  it("teaches the document layers Help must describe", () => {
    expect(HELP_SYSTEM_PROMPT).toMatch(/programme toolbar/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Read vs Edit vs Focus/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Focus/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Document owner/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Chapter owner/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/does not write chapters/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Ask may draft/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/comments on the right/i)
    expect(HELP_SYSTEM_PROMPT).toMatch(/own members and invitations/)
    expect(HELP_SYSTEM_PROMPT).toMatch(/Nobody is added silently/)
  })
})

describe("programme landing from job", () => {
  it("lands on the document unless a section is requested", () => {
    expect(resolveProgrammeLandingSection({ job: "reviewer" })).toBe("editor")
    expect(
      resolveProgrammeLandingSection({
        job: "author",
        guided: true,
        firstIncompleteSection: "analysis",
      }),
    ).toBe("editor")
    expect(resolveProgrammeLandingSection({ job: "author", sectionParam: "editor" })).toBe("editor")
    expect(resolveProgrammeLandingSection({ job: "author", sectionParam: "analysis" })).toBe("analysis")
  })
})
