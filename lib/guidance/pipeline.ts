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
  effectsChecked?: boolean
}

export type GuidanceChapterLike = {
  workflowStatus?: string | null
  hasBody?: boolean
  title?: string | null
  outlineNodeId?: string | null
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

export type PipelineStageStatus = "not_started" | "in_progress" | "ready"

export type GuidancePipelineSnapshot = {
  stages: Record<PipelineStageId, PipelineStageStatus>
  firstIncomplete: PipelineStageId | null
  firstIncompleteSection: string
  focusChapterId: string | null
  focusChapterTitle: string | null
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

function checkStatus(input: GuidancePipelineInput): PipelineStageStatus {
  if (input.measureCount === 0) return "not_started"
  return checkComplete(input) ? "ready" : "in_progress"
}

function checkComplete(input: GuidancePipelineInput): boolean {
  if (input.measureCount === 0) return false
  return input.measures.every(
    (measure) => measure.effectsChecked === true && effectsFieldsSet(measure) && deviationJustified(measure),
  )
}

const FRAMING_CHAPTER = /inleiding|wettelijk kader|legal framework|^visie\b/i

export function preferredDraftChapter(chapters: GuidanceChapterLike[]): GuidanceChapterLike | null {
  const open = chapters.filter((chapter) => !chapter.hasBody && (chapter.outlineNodeId || chapter.title))
  const substantive = open.filter((chapter) => !FRAMING_CHAPTER.test(chapter.title || ""))
  return substantive[0] || open[0] || null
}

function reviewComplete(input: GuidancePipelineInput): boolean {
  const drafted = input.chapters.filter((chapter) => chapter.hasBody)
  if (drafted.length === 0) return false
  const chaptersApproved = drafted.every((chapter) => chapter.workflowStatus === "approved")
  const reviewMeasures = input.measures.filter((measure) => {
    const status = measure.workflow_status ?? ""
    return status === "in_review" || status === "revised" || status === "approved"
  })
  const measuresApproved =
    reviewMeasures.length === 0 || reviewMeasures.every((measure) => measure.workflow_status === "approved")
  return chaptersApproved && measuresApproved
}

function bindStatus(input: GuidancePipelineInput): PipelineStageStatus {
  if (input.visionBound && input.existingPolicyBound) return "ready"
  if (input.visionBound || input.existingPolicyBound) return "in_progress"
  return "not_started"
}

export function deriveGuidancePipeline(input: GuidancePipelineInput): GuidancePipelineSnapshot {
  const stages: Record<PipelineStageId, PipelineStageStatus> = {
    orient: input.programmeExists ? "ready" : "not_started",
    bind: bindStatus(input),
    analyse: input.hasSucceededAnalysis ? "ready" : "not_started",
    structure:
      input.hasTemplate && input.outlineNodeCount >= 1 && input.measureCount >= 1
        ? "ready"
        : input.measureCount > 0
          ? "in_progress"
          : "not_started",
    draft: input.hasChapterBody ? "ready" : "not_started",
    check: checkStatus(input),
    review: reviewComplete(input) ? "ready" : input.hasChapterBody ? "in_progress" : "not_started",
    export: input.hasSuccessfulExport ? "ready" : "not_started",
  }

  const firstIncomplete = PIPELINE_STAGES.find((stage) => stages[stage] !== "ready") ?? null
  const draftTarget = preferredDraftChapter(input.chapters)
  const reviewTarget = input.chapters.find((chapter) => chapter.hasBody && chapter.workflowStatus !== "approved")
  const focus = firstIncomplete === "draft" ? draftTarget : firstIncomplete === "review" ? reviewTarget : null
  return {
    stages,
    firstIncomplete,
    firstIncompleteSection: firstIncomplete ? STAGE_TO_SECTION[firstIncomplete] : "export",
    focusChapterId: focus?.outlineNodeId ?? null,
    focusChapterTitle: focus?.title ?? null,
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
