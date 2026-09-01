/**
 * Phase 9.2 golden evaluation suite — deterministic fixtures (no live LLM).
 * Gates playbook / citation / measure / section contracts in CI via `npm test`.
 */

import { describe, expect, it } from "vitest"
import { compileSystemPrompt, DRAFT_STRICT_CITATION_MARKER, MEASURES_SAFETY_MARKER } from "@/lib/chat/playbook-compiler"
import { assessGroundedness } from "@/lib/programme/reliability"
import { parseMeasureCandidatesJson, canApproveMeasure } from "@/lib/programme/structured-artefacts"
import { extractSectionsFromPages } from "@/lib/documents/section-extraction"
import { markdownToExportSections, buildDocxFromSections } from "@/lib/export/markdown-to-docx"

const FIXTURE_VISION = {
  documentId: "vision-doc",
  text: [
    "Chapter 2 Strong Living Regions",
    "2.2 Housing and Mobility",
    "The corridor requires densification near stations.",
    "PROVINCIAL INTERESTS",
    "Inleiding",
  ].join("\n"),
}

describe("golden programme evals (Phase 9.2)", () => {
  it("section extraction recovers numbered + NL titles from fixture corpus", () => {
    const sections = extractSectionsFromPages([
      { pageNumber: 1, textContent: FIXTURE_VISION.text },
    ])
    expect(sections.some((s) => s.title.includes("2.2"))).toBe(true)
    expect(sections.some((s) => /inleiding/i.test(s.title))).toBe(true)
    expect(sections.some((s) => s.title === "PROVINCIAL INTERESTS")).toBe(true)
  })

  it("playbook compiler keeps measures safety and supports strict draft mode", () => {
    const measures = compileSystemPrompt({ kind: "measures", userLanguage: "Dutch" })
    expect(measures.systemPrompt).toContain(MEASURES_SAFETY_MARKER)

    const strict = compileSystemPrompt({
      kind: "draft",
      userLanguage: "English",
      citationMode: "strict",
    })
    expect(strict.systemPrompt).toContain(DRAFT_STRICT_CITATION_MARKER)
  })

  it("measure JSON fixture validates and blocks approval on unjustified deviation", () => {
    const raw = JSON.stringify({
      measures: [
        {
          title: "Station densification",
          type: "measure",
          specificAction: "Allow mid-rise housing within 800m of stations",
          effectsDirection: "positive",
          effectsDeviation: true,
          citations: [{ documentId: "vision-doc", quote: "densification near stations" }],
        },
      ],
    })
    const { measures, errors } = parseMeasureCandidatesJson(raw)
    expect(errors.length).toBeGreaterThan(0)
    expect(measures).toHaveLength(0)

    const okRaw = JSON.stringify({
      measures: [
        {
          title: "Station densification",
          type: "measure",
          specificAction: "Allow mid-rise housing within 800m of stations",
          effectsDirection: "positive",
          effectsDeviation: true,
          effectsJustification: "Aligned with vision corridor policy",
          citations: [{ documentId: "vision-doc", quote: "densification near stations" }],
        },
      ],
    })
    const ok = parseMeasureCandidatesJson(okRaw)
    expect(ok.measures).toHaveLength(1)
    expect(canApproveMeasure(ok.measures[0]!).ok).toBe(true)
  })

  it("groundedness scores a cited vision claim higher than an uncited claim", () => {
    const cited = assessGroundedness(
      `The corridor requires densification near stations. [citation:{"quote":"The corridor requires densification near stations.","documentId":"vision-doc","pageNumber":1}]`,
      [FIXTURE_VISION],
    )
    const uncited = assessGroundedness(
      "The corridor requires densification near stations according to the vision document.",
      [FIXTURE_VISION],
    )
    expect(cited.score).toBeGreaterThan(uncited.score)
    expect(uncited.issues.some((i) => i.reason === "missing_citation")).toBe(true)
  })

  it("DOCX export preserves fixture outline headings", async () => {
    const sections = markdownToExportSections(
      `# Strong Living Regions\n\nVision narrative.\n\n## Housing and Mobility\n\nDensify near stations.\n`,
    )
    const buffer = await buildDocxFromSections("Strong Living Regions", sections)
    expect(buffer.byteLength).toBeGreaterThan(500)
    expect(sections.some((s) => s.heading === "Housing and Mobility")).toBe(true)
  })
})
