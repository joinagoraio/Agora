/**
 * S2c spike: structured measure + analysis artefacts (Zod).
 * Proves the data contracts and deterministic validation/pipeline shape.
 * Does not call an LLM — model output is assumed as JSON text input.
 */

import { z } from "zod"
import { AGENT_STAGES, DOCUMENT_ROLES } from "@/lib/programme/domain"

export const measureTypeSchema = z.enum(["ambition", "goal", "measure", "implementation"])

export const effectsDirectionSchema = z.enum(["positive", "negative", "neutral", "unknown"])

export const measureCitationSchema = z.object({
  documentId: z.string().min(1),
  pageNumber: z.number().int().positive().optional(),
  sectionId: z.string().optional(),
  quote: z.string().min(1).optional(),
})

export const measureCandidateSchema = z.object({
  title: z.string().min(3).max(300),
  type: measureTypeSchema,
  specificAction: z.string().min(3),
  ownerRole: z.string().optional(),
  geography: z.string().optional(),
  timeline: z.string().optional(),
  indicator: z.string().optional(),
  successCriterion: z.string().optional(),
  contributesToVision: z.array(z.string()).default([]),
  provincialInterests: z.array(z.string()).default([]),
  effectsDirection: effectsDirectionSchema.default("unknown"),
  effectsDeviation: z.boolean().default(false),
  effectsJustification: z.string().optional(),
  citations: z.array(measureCitationSchema).min(1),
  narrative: z.string().optional(),
  outlineNodeId: z.string().uuid().optional().nullable(),
  challenge: z.string().optional(),
  resources: z.string().optional(),
  interestIds: z.array(z.string()).optional(),
})

export type MeasureCandidate = z.infer<typeof measureCandidateSchema>

export const policyDispositionSchema = z.enum(["adopt", "adapt", "drop", "missing"])

export const analysisFindingSchema = z.object({
  id: z.string().min(1),
  disposition: policyDispositionSchema,
  summary: z.string().min(3),
  sourceDocumentId: z.string().optional(),
  visionAnchor: z.string().optional(),
  provincialInterest: z.string().optional(),
  conflictWithDocumentId: z.string().optional(),
  measureId: z.string().optional(),
  outlineNodeId: z.string().optional(),
  addressed: z.boolean().optional(),
  effectsDirection: effectsDirectionSchema.optional(),
  effectsDeviation: z.boolean().optional(),
  effectsJustification: z.string().optional(),
  oerTheme: z.string().optional(),
  citations: z.array(measureCitationSchema).default([]),
})

export type AnalysisFinding = z.infer<typeof analysisFindingSchema>

export const analysisReportSchema = z.object({
  reportType: z.enum([
    "existing_policy",
    "coverage",
    "conflicts",
    "effects",
    "quality",
  ]),
  findings: z.array(analysisFindingSchema).min(1),
})

export type AnalysisReport = z.infer<typeof analysisReportSchema>

export const outlineFieldSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
})

export const programmeTemplateMetaSchema = z.object({
  name: z.string().min(2).max(200),
  qualityRules: z.string().optional().nullable(),
  outputForm: z.string().optional().nullable(),
})

export const agentStageSchema = z.enum(AGENT_STAGES)

export const agentVersionPayloadSchema = z.object({
  instructions: z.string().min(3),
  sourceRoles: z.array(z.enum(DOCUMENT_ROLES)).default([]),
  sourceDocumentIds: z.array(z.string().uuid()).default([]),
  outputContract: z.string().default("json"),
  qualityRules: z.string().default(""),
  provider: z.string().min(1).default("openai-compatible"),
  endpoint: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  credentialsRef: z.string().optional().nullable(),
  catalogModelId: z.string().uuid().optional().nullable(),
  model: z.string().min(1),
  changelog: z.string().optional().nullable(),
})

export type AgentVersionPayload = z.infer<typeof agentVersionPayloadSchema>

export const agentCreateSchema = z.object({
  name: z.string().min(2).max(200),
  role: z.string().min(2).max(200),
  stage: agentStageSchema,
  version: agentVersionPayloadSchema,
})

export type AgentCreateInput = z.infer<typeof agentCreateSchema>

export function parseAgentVersionPayload(raw: unknown): {
  data: AgentVersionPayload | null
  errors: string[]
} {
  const result = agentVersionPayloadSchema.safeParse(raw)
  if (!result.success) {
    return { data: null, errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`) }
  }
  return { data: result.data, errors: [] }
}

/**
 * Parse model JSON (array or { measures: [] }) into validated measure candidates.
 * Invalid items are collected — pipeline stays usable.
 */
export function parseMeasureCandidatesJson(raw: string): {
  measures: MeasureCandidate[]
  errors: Array<{ index: number; message: string }>
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      measures: [],
      errors: [{ index: -1, message: error instanceof Error ? error.message : "Invalid JSON" }],
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as any).measures)
      ? (parsed as any).measures
      : null

  if (!list) {
    return { measures: [], errors: [{ index: -1, message: "Expected array or { measures: [] }" }] }
  }

  const measures: MeasureCandidate[] = []
  const errors: Array<{ index: number; message: string }> = []

  list.forEach((item: unknown, index: number) => {
    const result = measureCandidateSchema.safeParse(item)
    if (result.success) {
      if (result.data.effectsDeviation && !result.data.effectsJustification?.trim()) {
        errors.push({
          index,
          message: "effectsDeviation=true requires effectsJustification",
        })
        return
      }
      measures.push(result.data)
    } else {
      errors.push({ index, message: result.error.errors.map((e) => e.message).join("; ") })
    }
  })

  return { measures, errors }
}

const REPORT_TYPES = new Set(["existing_policy", "coverage", "conflicts", "effects", "quality"])
const DISPOSITIONS = new Set(["adopt", "adapt", "drop", "missing"])

function extractJsonValue(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? (() => {
    const objectStart = trimmed.indexOf("{")
    const arrayStart = trimmed.indexOf("[")
    const start =
      objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart) ? objectStart : arrayStart
    const endChar = start === objectStart ? "}" : "]"
    const end = trimmed.lastIndexOf(endChar)
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
    return trimmed
  })()
  return JSON.parse(candidate)
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function coerceDisposition(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const lower = value.toLowerCase().trim()
  if (DISPOSITIONS.has(lower)) return lower
  if (/(adapt|reframe|update|revise)/.test(lower)) return "adapt"
  if (/(adopt|keep|retain|align)/.test(lower)) return "adopt"
  if (/(drop|obsolete|remove|reject)/.test(lower)) return "drop"
  if (/(missing|gap|uncovered|absent)/.test(lower)) return "missing"
  return undefined
}

function coerceFinding(item: unknown, index: number): unknown {
  if (!item || typeof item !== "object") return item
  const record = item as Record<string, unknown>
  const summary =
    pickString(record, ["summary", "title", "text", "description", "finding", "name", "ambition", "goal"]) ||
    `Finding ${index + 1}`
  return {
    ...record,
    id: pickString(record, ["id", "key", "uid"]) || `f${index + 1}`,
    disposition:
      coerceDisposition(record.disposition) ||
      coerceDisposition(record.action) ||
      coerceDisposition(record.status) ||
      coerceDisposition(record.type) ||
      "missing",
    summary,
    visionAnchor: pickString(record, ["visionAnchor", "anchor", "ambition"]) || undefined,
    provincialInterest: pickString(record, ["provincialInterest", "interest"]) || undefined,
    sourceDocumentId: pickString(record, ["sourceDocumentId", "documentId"]) || undefined,
    conflictWithDocumentId: pickString(record, ["conflictWithDocumentId"]) || undefined,
    measureId: pickString(record, ["measureId", "measure_id"]) || undefined,
    outlineNodeId: pickString(record, ["outlineNodeId", "outline_node_id"]) || undefined,
    addressed: record.addressed === true,
    effectsDirection:
      pickString(record, ["effectsDirection", "effects_direction"]) === "positive" ||
      pickString(record, ["effectsDirection", "effects_direction"]) === "negative" ||
      pickString(record, ["effectsDirection", "effects_direction"]) === "neutral"
        ? pickString(record, ["effectsDirection", "effects_direction"])
        : undefined,
    effectsDeviation: record.effectsDeviation === true || record.effects_deviation === true,
    effectsJustification: pickString(record, ["effectsJustification", "effects_justification"]) || undefined,
    oerTheme: pickString(record, ["oerTheme", "oer_theme", "theme", "effectsTheme"]) || undefined,
    citations: coerceFindingCitations(record.citations),
  }
}

function coerceFindingCitations(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return []
  const out: unknown[] = []
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ documentId: item.trim() })
      continue
    }
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    const documentId = pickString(rec, ["documentId", "document_id", "id"])
    if (!documentId) continue
    out.push({
      documentId,
      pageNumber: typeof rec.pageNumber === "number" ? rec.pageNumber : undefined,
      sectionId: pickString(rec, ["sectionId"]) || undefined,
      quote: pickString(rec, ["quote"]) || undefined,
    })
  }
  return out
}

function coerceAnalysisReport(parsed: unknown): unknown {
  if (Array.isArray(parsed)) {
    return { reportType: "coverage", findings: parsed.map(coerceFinding) }
  }
  if (!parsed || typeof parsed !== "object") return parsed
  const record = parsed as Record<string, unknown>
  const listed = [record.findings, record.nodes, record.items, record.ambitions, record.goals].find(Array.isArray)
  const reportTypeRaw = typeof record.reportType === "string" ? record.reportType : typeof record.type === "string" ? record.type : ""
  const reportType = REPORT_TYPES.has(reportTypeRaw)
    ? reportTypeRaw
    : /vision|coverage|graph/i.test(reportTypeRaw)
      ? "coverage"
      : /effect|oer/i.test(reportTypeRaw)
        ? "effects"
        : /quality|qc/i.test(reportTypeRaw)
          ? "quality"
          : /conflict/i.test(reportTypeRaw)
            ? "conflicts"
            : listed
              ? "coverage"
              : reportTypeRaw
  return {
    ...record,
    reportType,
    findings: (listed || []).map(coerceFinding),
  }
}

export function parseAnalysisReportJson(raw: string): {
  report: AnalysisReport | null
  errors: string[]
} {
  let parsed: unknown
  try {
    parsed = extractJsonValue(raw)
  } catch (error) {
    return {
      report: null,
      errors: [error instanceof Error ? error.message : "Invalid JSON"],
    }
  }

  const result = analysisReportSchema.safeParse(coerceAnalysisReport(parsed))
  if (!result.success) {
    return { report: null, errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`) }
  }
  return { report: result.data, errors: [] }
}

/**
 * Deterministic mini-analysis for spike confidence: map fragments to dispositions
 * using simple overlap with vision keywords (not an LLM).
 */
export function heuristicPolicyDisposition(input: {
  fragment: string
  visionText: string
  knownObsolete?: boolean
}): { disposition: z.infer<typeof policyDispositionSchema>; rationale: string } {
  const fragment = input.fragment.toLowerCase()
  const vision = input.visionText.toLowerCase()
  if (input.knownObsolete) {
    return { disposition: "drop", rationale: "Marked obsolete relative to vision horizon" }
  }

  const fragmentTokens = new Set(fragment.split(/\W+/).filter((t) => t.length > 4))
  const visionTokens = new Set(vision.split(/\W+/).filter((t) => t.length > 4))
  let overlap = 0
  for (const token of fragmentTokens) {
    if (visionTokens.has(token)) overlap++
  }
  const ratio = fragmentTokens.size === 0 ? 0 : overlap / fragmentTokens.size

  if (ratio >= 0.35) return { disposition: "adopt", rationale: `High lexical overlap (${ratio.toFixed(2)}) with vision` }
  if (ratio >= 0.15) return { disposition: "adapt", rationale: `Partial overlap (${ratio.toFixed(2)}); needs reframing` }
  return { disposition: "missing", rationale: `Low overlap (${ratio.toFixed(2)}); gap vs vision vocabulary` }
}

/**
 * Approval gate used by measures registry (spike): block incomplete provenance / unjustified deviation.
 */
const VAGUE_ACTION =
  /^(be |make |improve |enhance |support |promote |encourage |streven|verbeter|bevorder)/i

export function typologyLint(measure: MeasureCandidate): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (measure.type === "measure") {
    const action = measure.specificAction.trim()
    if (action.length < 12) reasons.push("measure action is too vague")
    if (VAGUE_ACTION.test(action) && action.split(/\s+/).length < 6) {
      reasons.push("measure reads as an aspiration, not a specific action")
    }
    if (!measure.timeline?.trim() && !measure.successCriterion?.trim()) {
      reasons.push("measure needs a timeline or success criterion")
    }
  }
  return { ok: reasons.length === 0, reasons }
}

export function canApproveMeasure(
  measure: MeasureCandidate,
  extras?: { hasVisionPath?: boolean; requireVisionPath?: boolean },
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (!measure.citations.length) reasons.push("missing citations")
  if (measure.effectsDeviation && !measure.effectsJustification?.trim()) {
    reasons.push("deviation requires justification")
  }
  if (measure.type === "measure" && !measure.specificAction.trim()) {
    reasons.push("measure requires specificAction")
  }
  const lint = typologyLint(measure)
  reasons.push(...lint.reasons)
  if (extras?.requireVisionPath && extras.hasVisionPath === false && measure.type === "measure") {
    reasons.push("measure has no contribution path in the vision graph")
  }
  return { ok: reasons.length === 0, reasons }
}
