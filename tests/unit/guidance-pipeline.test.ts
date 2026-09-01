import { deriveGuidancePipeline, pipelineInputFromWorkbench, STAGE_TO_SECTION } from "@/lib/guidance/pipeline"

const empty = {
  bindings: {
    environmentalVisionDocumentIds: [] as string[],
    existingPolicyDocumentIds: [] as string[],
    templateId: null as string | null,
  },
  reports: [] as Array<{ id?: string; report_type?: string | null }>,
  measures: [] as Array<{ workflow_status?: string | null }>,
  chapters: [] as Array<{ workflowStatus?: string | null; hasBody?: boolean }>,
  outlineNodeCount: 0,
  hasQcRun: false,
  hasSuccessfulExport: false,
}

describe("guidance pipeline derivation", () => {
  it("treats a new programme as incomplete at bind", () => {
    const snapshot = deriveGuidancePipeline(pipelineInputFromWorkbench({ ...empty }))
    expect(snapshot.stages.orient).toBe(true)
    expect(snapshot.stages.bind).toBe(false)
    expect(snapshot.firstIncomplete).toBe("bind")
    expect(snapshot.firstIncompleteSection).toBe(STAGE_TO_SECTION.bind)
  })

  it("completes bind only when vision and existing policy are both bound", () => {
    const visionOnly = deriveGuidancePipeline(
      pipelineInputFromWorkbench({
        ...empty,
        bindings: {
          environmentalVisionDocumentIds: ["v1"],
          existingPolicyDocumentIds: [],
          templateId: null,
        },
      }),
    )
    expect(visionOnly.stages.bind).toBe(false)

    const both = deriveGuidancePipeline(
      pipelineInputFromWorkbench({
        ...empty,
        bindings: {
          environmentalVisionDocumentIds: ["v1"],
          existingPolicyDocumentIds: ["p1"],
          templateId: null,
        },
      }),
    )
    expect(both.stages.bind).toBe(true)
    expect(both.firstIncomplete).toBe("analyse")
  })

  it("completes analyse when a report exists without a checkbox", () => {
    const snapshot = deriveGuidancePipeline(
      pipelineInputFromWorkbench({
        ...empty,
        bindings: {
          environmentalVisionDocumentIds: ["v1"],
          existingPolicyDocumentIds: ["p1"],
          templateId: null,
        },
        reports: [{ id: "r1", report_type: "existing_policy" }],
      }),
    )
    expect(snapshot.stages.analyse).toBe(true)
    expect(snapshot.firstIncomplete).toBe("structure")
  })

  it("completes structure with template, outline nodes, and a measure", () => {
    const snapshot = deriveGuidancePipeline(
      pipelineInputFromWorkbench({
        ...empty,
        bindings: {
          environmentalVisionDocumentIds: ["v1"],
          existingPolicyDocumentIds: ["p1"],
          templateId: "tpl",
        },
        reports: [{ id: "r1" }],
        outlineNodeCount: 3,
        measures: [{ workflow_status: "generated" }],
      }),
    )
    expect(snapshot.stages.structure).toBe(true)
    expect(snapshot.firstIncomplete).toBe("draft")
  })
})
