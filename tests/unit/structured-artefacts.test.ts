import { describe, expect, it } from "vitest"
import {
  canApproveMeasure,
  heuristicPolicyDisposition,
  parseAgentVersionPayload,
  parseAnalysisReportJson,
  parseMeasureCandidatesJson,
  typologyLint,
} from "@/lib/programme/structured-artefacts"

describe("structured programme artefacts (confidence spike)", () => {
  it("parses and validates measure candidates with citations", () => {
    const raw = JSON.stringify({
      measures: [
        {
          title: "Densify housing near regional stations",
          type: "measure",
          specificAction: "Allocate provincial co-funding for station-area housing pilots",
          timeline: "2026-2030",
          contributesToVision: ["Flevoland in balance"],
          provincialInterests: ["14", "20"],
          effectsDirection: "positive",
          effectsDeviation: false,
          citations: [{ documentId: "vision-1", pageNumber: 42, quote: "housing near nodes" }],
        },
      ],
    })

    const { measures, errors } = parseMeasureCandidatesJson(raw)
    expect(errors).toHaveLength(0)
    expect(measures).toHaveLength(1)
    expect(canApproveMeasure(measures[0]!).ok).toBe(true)
  })

  it("rejects deviation without justification and missing citations", () => {
    const raw = JSON.stringify([
      {
        title: "Expand road capacity through quiet areas",
        type: "measure",
        specificAction: "Widen provincial road N123",
        effectsDirection: "negative",
        effectsDeviation: true,
        citations: [{ documentId: "oer-1", pageNumber: 10 }],
      },
      {
        title: "Vague ambition",
        type: "ambition",
        specificAction: "Be greener",
        citations: [],
      },
    ])

    const { measures, errors } = parseMeasureCandidatesJson(raw)
    expect(measures).toHaveLength(0)
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it("parses analysis reports and runs heuristic disposition", () => {
    const reportRaw = JSON.stringify({
      reportType: "existing_policy",
      findings: [
        {
          id: "f1",
          disposition: "adapt",
          summary: "Housing agenda needs reframing to vision 2050",
          sourceDocumentId: "woonagenda",
          citations: [{ documentId: "vision-1", pageNumber: 12 }],
        },
      ],
    })
    const { report, errors } = parseAnalysisReportJson(reportRaw)
    expect(errors).toHaveLength(0)
    expect(report?.findings[0]?.disposition).toBe("adapt")

    const adopt = heuristicPolicyDisposition({
      fragment: "housing mobility stations densification regional public transport corridors",
      visionText: "housing near stations mobility public transport densification regional corridors balance",
    })
    expect(adopt.disposition).toBe("adopt")

    const missing = heuristicPolicyDisposition({
      fragment: "unrelated aquaculture tarpon yields",
      visionText: "housing near stations mobility public transport",
    })
    expect(missing.disposition).toBe("missing")
  })

  it("coerces loose vision findings and fenced JSON into the report contract", () => {
    const raw = [
      "```json",
      JSON.stringify({
        type: "vision-graph",
        ambitions: [
          { title: "Housing near nodes", action: "keep aligned" },
          { name: "Quiet landscapes", status: "gap versus vision" },
        ],
      }),
      "```",
    ].join("\n")
    const { report, errors } = parseAnalysisReportJson(raw)
    expect(errors).toHaveLength(0)
    expect(report?.reportType).toBe("coverage")
    expect(report?.findings).toHaveLength(2)
    expect(report?.findings[0]).toMatchObject({
      id: "f1",
      disposition: "adopt",
      summary: "Housing near nodes",
    })
    expect(report?.findings[1]?.disposition).toBe("missing")
  })

  it("drops null optional finding fields and string citations", () => {
    const raw = JSON.stringify({
      reportType: "existing_policy",
      findings: [
        {
          id: "f1",
          disposition: "adapt",
          summary: "Station pilots need reframing to the vision",
          sourceDocumentId: null,
          conflictWithDocumentId: null,
          citations: ["doc-vision-1", { documentId: "doc-policy-1", quote: "co-funding" }],
        },
      ],
    })
    const { report, errors } = parseAnalysisReportJson(raw)
    expect(errors).toHaveLength(0)
    expect(report?.findings[0]?.sourceDocumentId).toBeUndefined()
    expect(report?.findings[0]?.citations).toEqual([
      { documentId: "doc-vision-1" },
      { documentId: "doc-policy-1", quote: "co-funding" },
    ])
  })

  it("parses agent version payloads and accepts empty endpoints", () => {
    const { data, errors } = parseAgentVersionPayload({
      instructions: "Write measures from bound sources only",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      endpoint: "",
    })
    expect(errors).toHaveLength(0)
    expect(data?.model).toBe("gpt-4o-mini")
    expect(data?.endpoint).toBeNull()
  })

  it("blocks vague measures via typology lint and missing vision path", () => {
    const vague = typologyLint({
      title: "Be greener overall",
      type: "measure",
      specificAction: "Be greener",
      citations: [{ documentId: "doc-1" }],
      contributesToVision: [],
      provincialInterests: [],
      effectsDirection: "unknown",
      effectsDeviation: false,
    })
    expect(vague.ok).toBe(false)

    const gate = canApproveMeasure(
      {
        title: "Densify housing near regional stations",
        type: "measure",
        specificAction: "Allocate provincial co-funding for station-area housing pilots",
        timeline: "2026-2030",
        citations: [{ documentId: "vision-1" }],
        contributesToVision: [],
        provincialInterests: [],
        effectsDirection: "positive",
        effectsDeviation: false,
      },
      { requireVisionPath: true, hasVisionPath: false },
    )
    expect(gate.ok).toBe(false)
    expect(gate.reasons.join(" ")).toMatch(/contribution path/)

    const ready = canApproveMeasure(
      {
        title: "Densify housing near regional stations",
        type: "measure",
        specificAction: "Allocate provincial co-funding for station-area housing pilots",
        timeline: "2026-2030",
        citations: [{ documentId: "vision-1" }],
        contributesToVision: ["Housing near nodes"],
        provincialInterests: [],
        effectsDirection: "positive",
        effectsDeviation: false,
      },
      { requireVisionPath: true, hasVisionPath: true },
    )
    expect(ready.ok).toBe(true)
  })
})
