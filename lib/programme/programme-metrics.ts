/**
 * Phase 9.4 — programme observability metrics from generation_runs / export_jobs.
 */

export type GenerationRunMetricRow = {
  kind: string
  model?: string | null
  source_document_ids?: string[] | null
  unused_document_ids?: string[] | null
  created_at?: string
}

export type ExportJobMetricRow = {
  status: string
  format?: string | null
  created_at?: string
}

export type ProgrammeObservabilityMetrics = {
  generationRunCount: number
  byKind: Record<string, number>
  citationCoverageRate: number | null
  /** Share of runs that left unused source documents (retrieval waste signal). */
  unusedSourceRate: number | null
  exportJobCount: number
  exportFailureRate: number | null
  hasSuccessfulExport: boolean
  modelsUsed: string[]
}

export function computeProgrammeObservabilityMetrics(input: {
  runs: GenerationRunMetricRow[]
  exportJobs: ExportJobMetricRow[]
}): ProgrammeObservabilityMetrics {
  const byKind: Record<string, number> = {}
  const models = new Set<string>()
  let runsWithSources = 0
  let runsWithUnused = 0
  let coveredRuns = 0

  for (const run of input.runs) {
    byKind[run.kind] = (byKind[run.kind] || 0) + 1
    if (run.model) models.add(run.model)

    const sources = run.source_document_ids || []
    const unused = run.unused_document_ids || []
    if (sources.length > 0) {
      runsWithSources += 1
      if (unused.length > 0) runsWithUnused += 1
      // Coverage: fraction of sourced runs where at least one source was used
      if (unused.length < sources.length) coveredRuns += 1
    }
  }

  const failedExports = input.exportJobs.filter((j) => j.status === "failed").length

  return {
    generationRunCount: input.runs.length,
    byKind,
    citationCoverageRate: runsWithSources === 0 ? null : Number((coveredRuns / runsWithSources).toFixed(4)),
    unusedSourceRate: runsWithSources === 0 ? null : Number((runsWithUnused / runsWithSources).toFixed(4)),
    exportJobCount: input.exportJobs.length,
    exportFailureRate:
      input.exportJobs.length === 0 ? null : Number((failedExports / input.exportJobs.length).toFixed(4)),
    hasSuccessfulExport: input.exportJobs.some((job) => job.status === "completed"),
    modelsUsed: [...models].sort(),
  }
}
