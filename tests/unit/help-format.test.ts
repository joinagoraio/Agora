import { describe, expect, it } from "vitest"
import {
  compileHelpAnswer,
  composeGlossaryHelp,
  formatBoundDocumentList,
} from "@/lib/guidance/help-format"
import { glossaryDefinition, resolveGlossaryEntry } from "@/lib/guidance/help-corpus"

const BOUND_TITLES = [
  { title: "Environmental effects alignment", role: "environmental_effects_report" },
  { title: "Measures programme", role: "programme_handbook" },
  { title: "Existing housing programme — station pilots (fixture)", role: "existing_policy" },
  { title: "Environmental vision — housing near nodes (fixture)", role: "environmental_vision" },
]

const WALL_OF_TEXT = `Bound documents are external policy or strategic documents you’ve formally attached to this programme to constrain its scope and ensure consistency. You bind them on the Knowledge → Files sheet; once bound, their titles and roles appear in the header and guide your drafting.

In your programme the following documents are bound:

Environmental effects alignment (effects report)
Measures programme (handbook)
Existing housing programme — station pilots (fixture) (existing_policy)
Environmental vision — housing near nodes (fixture) (environmental_vision)
To review or change these bindings, open the Bound Sources sheet.`

describe("help format compiler", () => {
  it("turns a bound-document wall of text into heading, body, list, and next step", () => {
    const formatted = compileHelpAnswer(WALL_OF_TEXT, {
      documentTitles: BOUND_TITLES,
      language: "en",
    })

    expect(formatted).toMatch(/^## Bound documents/)
    expect(formatted).toContain("constrain its scope")
    expect(formatted).toContain("### In this programme")
    expect(formatted).toContain("- **Environmental effects alignment** (Environmental effects report)")
    expect(formatted).toContain("- **Measures programme** (Programme handbook)")
    expect(formatted).toContain("- **Existing housing programme — station pilots (fixture)** (Existing policy)")
    expect(formatted).not.toMatch(/Environmental effects alignment \(effects report\)/)
    expect(formatted).toMatch(/To review or change these bindings/)
    expect(formatted.indexOf("### In this programme")).toBeLessThan(
      formatted.indexOf("To review or change these bindings"),
    )
  })

  it("rebuilds a list even when titles were inlined in one paragraph", () => {
    const formatted = compileHelpAnswer(
      "Bound documents constrain the programme. Environmental effects alignment (effects report) and Measures programme (handbook) are bound.",
      { documentTitles: BOUND_TITLES.slice(0, 2) },
    )

    expect(formatted).toContain("## Bound documents")
    expect(formatted).toContain("constrain the programme")
    expect(formatted).toContain("- **Environmental effects alignment** (Environmental effects report)")
    expect(formatted).toContain("- **Measures programme** (Programme handbook)")
    expect(formatted).not.toMatch(/alignment \(effects report\) and Measures/)
    expect(formatted).not.toMatch(/\band are bound\b/)
  })

  it("keeps NAVIGATE on its own last line", () => {
    const formatted = compileHelpAnswer(
      `${WALL_OF_TEXT}\nNAVIGATE: /workspaces/abc/programme?section=corpus`,
      { documentTitles: BOUND_TITLES },
    )
    expect(formatted.trim().endsWith("NAVIGATE: /workspaces/abc/programme?section=corpus")).toBe(true)
  })

  it("promotes title-role lines to a list when no catalogue is provided", () => {
    const formatted = compileHelpAnswer(
      `Here are the files:\nEnvironmental effects alignment (effects report)\nMeasures programme (handbook)\nOpen Knowledge to change them.`,
    )
    expect(formatted).toContain("- **Environmental effects alignment** (Environmental effects report)")
    expect(formatted).toContain("- **Measures programme** (Programme handbook)")
  })

  it("turns a what-is wall of text into a heading, lead, and list", () => {
    const formatted = compileHelpAnswer(
      "Analysis is a complementary tool that writes saved reports from bound sources. It does not write chapters or the programme document. Analysis agents write reports only, never chapters. Open it from the document menu.",
      { question: "What is analysis?" },
    )
    expect(formatted).toMatch(/^## Analysis/)
    expect(formatted).toContain("writes saved reports from bound sources.")
    expect(formatted).toContain("- It does not write chapters or the programme document")
    expect(formatted).toContain("- Analysis agents write reports only, never chapters")
    expect(formatted).toMatch(/Open it from the document menu/)
    expect(formatted).not.toMatch(/sources\. It does not write/)
  })

  it("reshapes a one-paragraph analysis answer into the expected Help layout", () => {
    const formatted = compileHelpAnswer(
      "Analysis is a complementary tool for your programme—found under the document menu → Work → Analysis. It lets you run and save analytical reports (for example on environmental effects, policy alignment or spatial data) but it does not create or edit your chapter text. You can open it any time to view existing reports or generate new ones.",
      { question: "What is analysis?" },
    )
    expect(formatted).toMatch(/^## Analysis/)
    expect(formatted).toContain("Analysis is a complementary tool for your programme.")
    expect(formatted).toContain("- Found under the document menu → Work → Analysis")
    expect(formatted).toContain("- It lets you run and save analytical reports")
    expect(formatted).toContain("- It does not create or edit your chapter text")
    expect(formatted).toMatch(/You can open it any time/)
    expect(formatted).not.toMatch(/programme—found under/)
  })
})

describe("glossary help composition", () => {
  it("resolves what-are questions to the bindings entry", () => {
    expect(resolveGlossaryEntry("What are bound documents?")?.key).toBe("bindings")
    expect(glossaryDefinition("What are the bound documents in this programme")).toBe(
      glossaryDefinition("bindings"),
    )
  })

  it("lists the programme's bound documents under the definition", () => {
    const text = composeGlossaryHelp("bindings", glossaryDefinition("bindings") ?? "", {
      documentTitles: BOUND_TITLES,
      language: "en",
    })
    expect(text).toMatch(/^## Bound documents/)
    expect(text).toContain("vision")
    expect(text).toContain(formatBoundDocumentList(BOUND_TITLES, "en"))
    expect(text).toContain("Knowledge → Files")
  })

  it("resolves what is analysis to a structured glossary answer", () => {
    expect(resolveGlossaryEntry("What is analysis?")?.key).toBe("analysis")
    const text = composeGlossaryHelp("analysis", glossaryDefinition("analysis") ?? "", { language: "en" })
    expect(text).toMatch(/^## Analysis/)
    expect(text).toContain("Analysis is a complementary tool for your programme.")
    expect(text).toContain("- It lives under the document menu → Work → Analysis")
    expect(text).toContain("- It does not create or edit chapter text")
    expect(text).toMatch(/Open it any time/)
  })
})
