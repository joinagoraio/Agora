import { describe, expect, it } from "vitest"
import {
  assessGroundedness,
  assessMeasureCitations,
  findUngroundedClaims,
  DEFAULT_RETENTION_POLICY,
  parseRetentionPolicy,
  assertDestructiveAllowed,
  isPastRetention,
} from "@/lib/programme/reliability"
import {
  parsePlaybookRuntimeConfig,
  resolveModelForTask,
  DEFAULT_MODEL_TIERS,
} from "@/lib/programme/model-tiers"
import { computeProgrammeObservabilityMetrics } from "@/lib/programme/programme-metrics"

describe("reliability helpers (Phase 9)", () => {
  it("flags factual sentences without citations", () => {
    const issues = findUngroundedClaims(
      "The province must densify housing near stations according to the vision. Another short line.",
    )
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.reason).toBe("missing_citation")
  })

  it("verifies structured citations against evidence text", () => {
    const evidence = [
      {
        documentId: "doc-1",
        text: "Housing near stations is a provincial priority for densification.",
      },
    ]
    const good = assessGroundedness(
      `Policy states that "Housing near stations is a provincial priority for densification." [citation:{"quote":"Housing near stations is a provincial priority for densification.","documentId":"doc-1","pageNumber":1}]`,
      evidence,
    )
    expect(good.citationCount).toBe(1)
    expect(good.issues.filter((i) => i.reason === "quote_not_found")).toHaveLength(0)

    const bad = assessGroundedness(
      `The regional plan must densify housing corridors near stations according to adopted policy. [citation:{"quote":"This quote does not exist in the corpus.","documentId":"doc-1","pageNumber":1}]`,
      evidence,
    )
    expect(bad.issues.some((i) => i.reason === "quote_not_found")).toBe(true)
    expect(bad.issues.some((i) => i.reason === "missing_citation")).toBe(true)
  })

  it("rejects measure citations for unknown documents", () => {
    const issues = assessMeasureCitations(
      [{ documentId: "missing", quote: "x" }],
      [{ documentId: "doc-1", text: "x" }],
    )
    expect(issues.some((i) => i.reason === "unknown_document")).toBe(true)
  })

  it("exposes default retention / no-train policy", () => {
    expect(DEFAULT_RETENTION_POLICY.noTrainOnCustomerContent).toBe(true)
    expect(DEFAULT_RETENTION_POLICY.dataResidency).toBe("eu")
  })

  it("parses retention policy and blocks destructive ops under legal hold", () => {
    const policy = parseRetentionPolicy({
      reliabilityPolicy: {
        retainGenerationsDays: 90,
        legalHold: true,
        dataResidency: "eu",
        noTrainOnCustomerContent: true,
      },
    })
    expect(policy.retainGenerationsDays).toBe(90)
    expect(assertDestructiveAllowed(policy).ok).toBe(false)
    expect(assertDestructiveAllowed({ ...policy, legalHold: false }).ok).toBe(true)
    expect(isPastRetention("2000-01-01T00:00:00.000Z", 30)).toBe(true)
    expect(isPastRetention(new Date().toISOString(), 30)).toBe(false)
  })
})

describe("model tiers (Phase 9.3)", () => {
  it("defaults match current Agora chat/draft behaviour", () => {
    expect(resolveModelForTask("chat", null)).toBe(DEFAULT_MODEL_TIERS.chat)
    expect(resolveModelForTask("chat", null, { isDocumentPreview: true })).toBe(
      DEFAULT_MODEL_TIERS.chatPreview,
    )
  })

  it("parses playbook config overrides", () => {
    const config = parsePlaybookRuntimeConfig({
      models: { draft: "gpt-4o", measures: "gpt-4.1-mini" },
      citationMode: "strict",
    })
    expect(config.citationMode).toBe("strict")
    expect(resolveModelForTask("draft", config)).toBe("gpt-4o")
    expect(resolveModelForTask("measures", config)).toBe("gpt-4.1-mini")
    expect(resolveModelForTask("chat", config)).toBe(DEFAULT_MODEL_TIERS.chat)
  })
})

describe("programme observability metrics (Phase 9.4)", () => {
  it("computes coverage and export failure rates", () => {
    const metrics = computeProgrammeObservabilityMetrics({
      runs: [
        {
          kind: "draft",
          model: "gpt-4o-mini",
          source_document_ids: ["a", "b"],
          unused_document_ids: ["b"],
        },
        {
          kind: "measures",
          model: "gpt-4o-mini",
          source_document_ids: ["a"],
          unused_document_ids: [],
        },
        { kind: "export", model: null, source_document_ids: [], unused_document_ids: [] },
      ],
      exportJobs: [
        { status: "completed" },
        { status: "failed" },
        { status: "completed" },
      ],
    })
    expect(metrics.generationRunCount).toBe(3)
    expect(metrics.byKind.draft).toBe(1)
    expect(metrics.citationCoverageRate).toBe(1)
    expect(metrics.unusedSourceRate).toBe(0.5)
    expect(metrics.exportFailureRate).toBeCloseTo(1 / 3)
    expect(metrics.modelsUsed).toEqual(["gpt-4o-mini"])
  })
})
