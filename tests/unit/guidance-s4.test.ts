import { describe, expect, it } from "vitest"
import { glossaryDefinition } from "@/lib/guidance/help-corpus"
import { isSpaceHelpAiDisabled, resolveHelpAiEnabled } from "@/lib/guidance/help-flag"
import { sanitizeGuidanceTelemetry } from "@/lib/guidance/telemetry"

describe("tenant Help AI flag", () => {
  it("treats only explicit true as disabled", () => {
    expect(isSpaceHelpAiDisabled({ helpAiDisabled: true })).toBe(true)
    expect(isSpaceHelpAiDisabled({ helpAiDisabled: false })).toBe(false)
    expect(isSpaceHelpAiDisabled({})).toBe(false)
    expect(isSpaceHelpAiDisabled(null)).toBe(false)
  })

  it("turns Help off for the tenant even when the env flag is on", () => {
    expect(resolveHelpAiEnabled({ envEnabled: true, spaceHelpAiDisabled: true })).toBe(false)
    expect(resolveHelpAiEnabled({ envEnabled: true, spaceHelpAiDisabled: false })).toBe(true)
    expect(resolveHelpAiEnabled({ envEnabled: false, spaceHelpAiDisabled: false })).toBe(false)
  })
})

describe("guidance telemetry payload", () => {
  it("keeps only aggregate fields", () => {
    expect(
      sanitizeGuidanceTelemetry({
        event: "help_refusal",
        job: "author",
        mode: "guided",
        section: "editor",
      }),
    ).toEqual({
      event: "help_refusal",
      job: "author",
      mode: "guided",
      section: "editor",
    })
  })

  it("rejects payloads that include policy text", () => {
    expect(
      sanitizeGuidanceTelemetry({
        event: "help_ask",
        section: "editor",
        text: "write chapter 3 from the housing programme",
      }),
    ).toBeNull()
    expect(sanitizeGuidanceTelemetry({ event: "draft_chapter", body: "nope" })).toBeNull()
    expect(sanitizeGuidanceTelemetry(null)).toBeNull()
  })
})

describe("glossary aliases", () => {
  it("opens bindings from bound documents", () => {
    const bindings = glossaryDefinition("bindings")
    expect(bindings).toMatch(/vision/i)
    expect(glossaryDefinition("bound documents")).toBe(bindings)
    expect(glossaryDefinition("organisation")).toBe(glossaryDefinition("authority"))
  })
})
