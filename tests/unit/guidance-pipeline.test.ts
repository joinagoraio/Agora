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
    expect(snapshot.stages.orient).toBe("ready")
    expect(snapshot.stages.bind).toBe("not_started")
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
    expect(visionOnly.stages.bind).toBe("in_progress")

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
    expect(both.stages.bind).toBe("ready")
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
    expect(snapshot.stages.analyse).toBe("ready")
    expect(snapshot.stages.check).toBe("not_started")
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
    expect(snapshot.stages.structure).toBe("ready")
    expect(snapshot.firstIncomplete).toBe("check")
    expect(snapshot.firstIncompleteSection).toBe(STAGE_TO_SECTION.check)
  })

  it("asks for effects before drafting once measures exist", () => {
    const generated = deriveGuidancePipeline(
      pipelineInputFromWorkbench({
        ...empty,
        bindings: {
          environmentalVisionDocumentIds: ["v1"],
          existingPolicyDocumentIds: ["p1"],
          templateId: "tpl",
        },
        reports: [{ id: "r1" }],
        outlineNodeCount: 3,
        measures: [{ workflow_status: "generated", effects_direction: "positive", effects_deviation: false }],
      }),
    )
    expect(generated.stages.check).toBe("in_progress")
    expect(generated.firstIncomplete).toBe("check")

    const saved = deriveGuidancePipeline(
      pipelineInputFromWorkbench({
        ...empty,
        bindings: {
          environmentalVisionDocumentIds: ["v1"],
          existingPolicyDocumentIds: ["p1"],
          templateId: "tpl",
        },
        reports: [{ id: "r1" }],
        outlineNodeCount: 3,
        measures: [
          {
            workflow_status: "generated",
            effects_direction: "positive",
            effects_deviation: false,
            effectsChecked: true,
          },
        ],
      }),
    )
    expect(saved.stages.check).toBe("ready")
    expect(saved.firstIncomplete).toBe("draft")
    expect(saved.firstIncompleteSection).toBe(STAGE_TO_SECTION.draft)
  })

  it("names the chapter that can be drafted and ignores framing headings", () => {
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
        measures: [{ effectsChecked: true, effects_direction: "positive" }],
        chapters: [
          { title: "Inleiding en wettelijk kader", outlineNodeId: "intro", hasBody: false },
          { title: "Visie 4.2 Sterke Leefregio's", outlineNodeId: "visie", hasBody: false },
          { title: "Wonen en samenleving", outlineNodeId: "wonen", hasBody: false },
        ],
      }),
    )
    expect(snapshot.firstIncomplete).toBe("draft")
    expect(snapshot.focusChapterTitle).toBe("Wonen en samenleving")
    expect(snapshot.focusChapterId).toBe("wonen")
  })

  it("treats review as done when every drafted chapter is approved", () => {
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
        measures: [{ effectsChecked: true, effects_direction: "positive" }],
        chapters: [
          { title: "Inleiding", outlineNodeId: "intro", hasBody: false, workflowStatus: "generated" },
          { title: "Wonen en samenleving", outlineNodeId: "wonen", hasBody: true, workflowStatus: "approved" },
        ],
      }),
    )
    expect(snapshot.stages.review).toBe("ready")
    expect(snapshot.firstIncomplete).toBe("export")
  })
})
