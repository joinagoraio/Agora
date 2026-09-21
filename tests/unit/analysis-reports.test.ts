import { describe, expect, it } from "vitest"
import { emptyProgrammeBindings } from "@/lib/programme/domain"
import {
  applyFindingAddressed,
  conflictFindings,
  diffAnalysisFindings,
  diffSnapshots,
  formatSectionEvidence,
  matchFindingToMeasure,
  preflightAnalysisRun,
} from "@/lib/programme/analysis-reports"
import type { AnalysisFinding } from "@/lib/programme/structured-artefacts"

const finding = (partial: Partial<AnalysisFinding> & Pick<AnalysisFinding, "id" | "summary">): AnalysisFinding => ({
  disposition: "adapt",
  citations: [],
  ...partial,
})

describe("analysis report helpers", () => {
  it("diffs findings by disposition and summary", () => {
    const a = [finding({ id: "1", summary: "Keep station pilots", disposition: "adopt" })]
    const b = [
      finding({ id: "1", summary: "Keep station pilots", disposition: "adopt" }),
      finding({ id: "2", summary: "Drop sprawl subsidy", disposition: "drop" }),
    ]
    const diff = diffAnalysisFindings(a, b)
    expect(diff.shared).toHaveLength(1)
    expect(diff.onlyB.map((item) => item.id)).toEqual(["2"])
    expect(diff.onlyA).toHaveLength(0)
  })

  it("formats section evidence with sectionId", () => {
    const text = formatSectionEvidence(
      [{ id: "doc-1", title: "Vision", content: "AAAAHousing near nodes BBBB", documentRole: "environmental_vision" }],
      [{ id: "sec-1", documentId: "doc-1", title: "Housing", pageNumber: 2, startOffset: 4 }],
    )
    expect(text).toContain("sectionId=sec-1")
    expect(text).toContain("Housing near nodes")
  })

  it("prefers document body when no sections exist", () => {
    const text = formatSectionEvidence(
      [{ id: "doc-1", title: "Vision", content: "<p>Full body</p>", documentRole: "environmental_vision" }],
      [],
    )
    expect(text).toContain("Full body")
  })

  it("requires a bound analysis agent plus vision and policy docs", () => {
    const bindings = {
      ...emptyProgrammeBindings(),
      environmentalVisionDocumentIds: ["v"],
      existingPolicyDocumentIds: ["p"],
    }
    expect(
      preflightAnalysisRun({
        kind: "analysis",
        agentId: null,
        bindings,
        documents: [{ id: "v", title: "V", content: "", documentRole: "environmental_vision" }],
      }).ok,
    ).toBe(false)
    expect(
      preflightAnalysisRun({
        kind: "analysis",
        agentId: "agent",
        bindings: emptyProgrammeBindings(),
        documents: [{ id: "v", title: "V", content: "", documentRole: "environmental_vision" }],
      }).ok,
    ).toBe(false)
    expect(
      preflightAnalysisRun({
        kind: "analysis",
        agentId: "agent",
        bindings,
        documents: [
          { id: "v", title: "V", content: "", documentRole: "environmental_vision" },
          { id: "p", title: "P", content: "", documentRole: "existing_policy" },
        ],
      }),
    ).toEqual({ ok: true })
  })

  it("lets QC run without handbook or style sources so it can report that gap", () => {
    expect(
      preflightAnalysisRun({
        kind: "qc",
        agentId: "qc-agent",
        bindings: emptyProgrammeBindings(),
        documents: [],
      }),
    ).toEqual({ ok: true })
    expect(
      preflightAnalysisRun({
        kind: "oer",
        agentId: "oer-agent",
        bindings: emptyProgrammeBindings(),
        documents: [],
      }),
    ).toEqual({ ok: false, reason: "The bound agent has no source documents" })
  })

  it("extracts conflicts, addresses findings, and matches measures", () => {
    const findings = [
      finding({ id: "c1", summary: "Contradiction", conflictWithDocumentId: "doc-b" }),
      finding({ id: "ok", summary: "Allocate Budget for Housing Near Nodes", measureId: "m1" }),
    ]
    expect(conflictFindings(findings)).toHaveLength(1)
    expect(applyFindingAddressed(findings, "c1", true)[0]?.addressed).toBe(true)
    expect(matchFindingToMeasure(findings[1]!, [{ id: "m1", title: "Allocate Budget for Housing Near Nodes" }])?.id).toBe(
      "m1",
    )
  })

  it("diffs two snapshots by path", () => {
    const diff = diffSnapshots({ title: "A", body: "one" }, { title: "A", body: "two" })
    expect(diff).toEqual([{ path: "body", before: "one", after: "two" }])
  })
})
