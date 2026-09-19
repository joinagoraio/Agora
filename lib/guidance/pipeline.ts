export const PIPELINE_STAGES = [
  "orient",
  "bind",
  "analyse",
  "structure",
  "check",
  "draft",
  "review",
  "export",
] as const

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]

export const STAGE_TO_SECTION: Record<PipelineStageId, string> = {
  orient: "overview",
  bind: "corpus",
  analyse: "analysis",
  structure: "measures",
  check: "effects",
  draft: "editor",
  review: "review",
  export: "export",
}

export const STAGE_TARGET: Partial<Record<PipelineStageId, string>> = {
  bind: "bind-vision",
  analyse: "run-analysis",
  structure: "generate-measures",
  check: "record-effects",
}

export type GuidanceMeasureLike = {
  workflow_status?: string | null
  effects_direction?: string | null
  effectsDirection?: string | null
  effects_deviation?: boolean | null
  effectsDeviation?: boolean | null
  effects_justification?: string | null
  effectsJustification?: string | null
}

export type GuidanceChapterLike = {
  workflowStatus?: string | null
  hasBody?: boolean
}

export type GuidancePipelineInput = {
  programmeExists: boolean
  visionBound: boolean
  existingPolicyBound: boolean
  hasSucceededAnalysis: boolean
  hasTemplate: boolean
  outlineNodeCount: number
  measureCount: number
  hasChapterBody: boolean
  measures: GuidanceMeasureLike[]
  hasQcRun: boolean
  chapters: GuidanceChapterLike[]
  hasSuccessfulExport: boolean
}

export type GuidancePipelineSnapshot = {
  stages: Record<PipelineStageId, boolean>
  firstIncomplete: PipelineStageId | null
  firstIncompleteSection: string
}

function effectsFieldsSet(measure: GuidanceMeasureLike): boolean {
  const direction = measure.effectsDirection ?? measure.effects_direction
  return typeof direction === "string" && direction.length > 0 && direction !== "unknown"
}

function deviationJustified(measure: GuidanceMeasureLike): boolean {
  const deviation = measure.effectsDeviation ?? measure.effects_deviation
  if (!deviation) return true
  const justification = (measure.effectsJustification ?? measure.effects_justification ?? "").trim()
  return justification.length > 0
}

function checkComplete(input: GuidancePipelineInput): boolean {
  if (input.measureCount === 0) return false
  return input.measures.every((measure) => effectsFieldsSet(measure) && deviationJustified(measure))
}

function reviewComplete(input: GuidancePipelineInput): boolean {
  if (input.chapters.length === 0) return false
  const chaptersApproved = input.chapters.every((chapter) => chapter.workflowStatus === "approved")
  const reviewMeasures = input.measures.filter((measure) => {
    const status = measure.workflow_status ?? ""
    return status === "in_review" || status === "revised" || status === "approved"
  })
  const measuresApproved =
    reviewMeasures.length === 0 || reviewMeasures.every((measure) => measure.workflow_status === "approved")
  return chaptersApproved && measuresApproved
}

export function deriveGuidancePipeline(input: GuidancePipelineInput): GuidancePipelineSnapshot {
  const stages: Record<PipelineStageId, boolean> = {
    orient: input.programmeExists,
    bind: input.visionBound && input.existingPolicyBound,
    analyse: input.hasSucceededAnalysis,
    structure: input.hasTemplate && input.outlineNodeCount >= 1 && input.measureCount >= 1,
    draft: input.hasChapterBody,
    check: checkComplete(input),
    review: reviewComplete(input),
    export: input.hasSuccessfulExport,
  }

  const firstIncomplete = PIPELINE_STAGES.find((stage) => !stages[stage]) ?? null
  return {
    stages,
    firstIncomplete,
    firstIncompleteSection: firstIncomplete ? STAGE_TO_SECTION[firstIncomplete] : "export",
  }
}

export function pipelineInputFromWorkbench(input: {
  bindings: {
    environmentalVisionDocumentIds?: string[]
    existingPolicyDocumentIds?: string[]
    templateId?: string | null
  }
  reports: Array<{ id?: string; report_type?: string | null }>
  measures: GuidanceMeasureLike[]
  chapters: GuidanceChapterLike[]
  outlineNodeCount: number
  hasQcRun: boolean
  hasSuccessfulExport: boolean
}): GuidancePipelineInput {
  return {
    programmeExists: true,
    visionBound: (input.bindings.environmentalVisionDocumentIds?.length ?? 0) >= 1,
    existingPolicyBound: (input.bindings.existingPolicyDocumentIds?.length ?? 0) >= 1,
    hasSucceededAnalysis: input.reports.length >= 1,
    hasTemplate: Boolean(input.bindings.templateId),
    outlineNodeCount: input.outlineNodeCount,
    measureCount: input.measures.length,
    hasChapterBody: input.chapters.some((chapter) => chapter.hasBody),
    measures: input.measures,
    hasQcRun: input.hasQcRun,
    chapters: input.chapters,
    hasSuccessfulExport: input.hasSuccessfulExport,
  }
}
