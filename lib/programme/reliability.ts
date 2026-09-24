/**
 * Phase 9 reliability — groundedness assessment, retention defaults.
 */

import { parseStructuredCitations } from "@/lib/utils/citation-parser"

export type GroundednessIssue = {
  claim: string
  reason: "missing_citation" | "weak_evidence" | "unknown_document" | "quote_not_found"
  documentId?: string
}

export type GroundednessEvidenceDoc = {
  documentId: string
  /** Concatenated page text (or any searchable corpus for that document). */
  text: string
}

export type GroundednessReport = {
  issues: GroundednessIssue[]
  citationCount: number
  /** Citations whose quote was found in the cited source. */
  verifiedCount: number
  factualClaimCount: number
  groundedClaimCount: number
  /** 0–1; 1 means every detected factual claim has a citation and every citation verifies. */
  score: number
}

/** Letters and digits only, so PDF line breaks, split words, and quote styles do not hide a real quote. */
function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

function quoteFound(corpus: string, quote: string): boolean {
  const parts = quote
    .split(/…|\.\.\.|\[\.\.\.\]/)
    .map(normalizeForMatch)
    .filter((part) => part.length >= 12)
  if (parts.length === 0) return false
  return parts.every((part) => corpus.includes(part))
}

function looksFactual(sentence: string): boolean {
  return /\b(must|shall|requires|according to|states that|provides|beleid|moet|volgens|vereist)\b/i.test(
    sentence,
  )
}

function hasInlineCitationMarker(sentence: string): boolean {
  return /\[\^\d+\]|\[citation:/i.test(sentence)
}

/** Prose for claim counting: no markup, and each citation shrunk to a marker on the sentence it supports. */
function claimSentences(text: string): string[] {
  const prose = text
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\[citation:\s*\{[\s\S]*?\}\s*\]/g, "[citation:]")
    .replace(/([.!?])(\s*\[citation:\])+/g, "$1[citation:]")
  return prose
    .split(/(?<=[.!?](?:\[citation:\])?)\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
}

/**
 * Flag markdown/footnote-style claims that look factual but lack citation markers.
 */
export function findUngroundedClaims(text: string): GroundednessIssue[] {
  const issues: GroundednessIssue[] = []
  const sentences = claimSentences(text)

  for (const sentence of sentences) {
    if (looksFactual(sentence) && !hasInlineCitationMarker(sentence)) {
      issues.push({ claim: sentence.slice(0, 180), reason: "missing_citation" })
    }
  }
  return issues
}

/**
 * Full groundedness pass: uncited factual claims + structured citation verification against evidence.
 */
export function assessGroundedness(
  text: string,
  evidence: GroundednessEvidenceDoc[],
): GroundednessReport {
  const evidenceById = new Map(
    evidence.map((e) => [e.documentId, normalizeForMatch(e.text)] as const),
  )
  const allowedIds = new Set(evidence.map((e) => e.documentId))

  const issues: GroundednessIssue[] = [...findUngroundedClaims(text)]
  const citations = parseStructuredCitations(text)
  let verified = 0

  for (const citation of citations) {
    const documentId = citation.structured?.documentId || citation.quote
    const quote = citation.structured?.quote || citation.quote
    if (!citation.structured?.documentId) {
      issues.push({
        claim: quote.slice(0, 180),
        reason: "unknown_document",
      })
      continue
    }

    if (!allowedIds.has(citation.structured.documentId)) {
      issues.push({
        claim: quote.slice(0, 180),
        reason: "unknown_document",
        documentId: citation.structured.documentId,
      })
      continue
    }

    const corpus = evidenceById.get(citation.structured.documentId) || ""
    if (!quoteFound(corpus, quote)) {
      issues.push({
        claim: quote.slice(0, 180),
        reason: "quote_not_found",
        documentId: citation.structured.documentId,
      })
      continue
    }

    verified += 1
  }

  const factualClaimCount = claimSentences(text).filter(looksFactual).length

  const groundedClaimCount = Math.max(0, factualClaimCount - issues.filter((i) => i.reason === "missing_citation").length)
  const citationPenalty = citations.length === 0 ? 0 : verified / citations.length
  const claimScore = factualClaimCount === 0 ? 1 : groundedClaimCount / factualClaimCount
  const score =
    citations.length === 0 && factualClaimCount === 0
      ? 1
      : citations.length === 0
        ? claimScore
        : (claimScore + citationPenalty) / 2

  return {
    issues,
    citationCount: citations.length,
    verifiedCount: verified,
    factualClaimCount,
    groundedClaimCount,
    score: Math.max(0, Math.min(1, Number(score.toFixed(4)))),
  }
}

/**
 * Verify measure-style citations (documentId + optional quote) against evidence IDs/text.
 */
export function assessMeasureCitations(
  citations: Array<{ documentId: string; quote?: string }>,
  evidence: GroundednessEvidenceDoc[],
): GroundednessIssue[] {
  const issues: GroundednessIssue[] = []
  const allowed = new Map(evidence.map((e) => [e.documentId, normalizeForMatch(e.text)]))

  if (citations.length === 0) {
    issues.push({ claim: "(measure)", reason: "missing_citation" })
    return issues
  }

  for (const citation of citations) {
    if (!allowed.has(citation.documentId)) {
      issues.push({
        claim: citation.quote?.slice(0, 180) || citation.documentId,
        reason: "unknown_document",
        documentId: citation.documentId,
      })
      continue
    }
    if (citation.quote) {
      const corpus = allowed.get(citation.documentId) || ""
      if (!quoteFound(corpus, citation.quote)) {
        issues.push({
          claim: citation.quote.slice(0, 180),
          reason: "quote_not_found",
          documentId: citation.documentId,
        })
      }
    }
  }
  return issues
}

export type RetentionPolicy = {
  retainGenerationsDays: number
  retainExportsDays: number
  legalHold: boolean
  noTrainOnCustomerContent: boolean
  dataResidency: "eu" | "us" | "unspecified"
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  retainGenerationsDays: 365,
  retainExportsDays: 180,
  legalHold: false,
  noTrainOnCustomerContent: true,
  dataResidency: "eu",
}

const residencySchema = ["eu", "us", "unspecified"] as const

function clampDays(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(3650, Math.max(30, Math.floor(n)))
}

/**
 * Parse space.metadata.reliabilityPolicy (or legacy retentionPolicy) with safe defaults.
 */
export function parseRetentionPolicy(metadata: Record<string, unknown> | null | undefined): RetentionPolicy {
  const raw = (metadata?.reliabilityPolicy ?? metadata?.retentionPolicy ?? {}) as Record<string, unknown>
  const residency = residencySchema.includes(raw.dataResidency as (typeof residencySchema)[number])
    ? (raw.dataResidency as RetentionPolicy["dataResidency"])
    : DEFAULT_RETENTION_POLICY.dataResidency

  return {
    retainGenerationsDays: clampDays(raw.retainGenerationsDays, DEFAULT_RETENTION_POLICY.retainGenerationsDays),
    retainExportsDays: clampDays(raw.retainExportsDays, DEFAULT_RETENTION_POLICY.retainExportsDays),
    legalHold: Boolean(raw.legalHold),
    noTrainOnCustomerContent:
      raw.noTrainOnCustomerContent === undefined
        ? DEFAULT_RETENTION_POLICY.noTrainOnCustomerContent
        : Boolean(raw.noTrainOnCustomerContent),
    dataResidency: residency,
  }
}

export function isPastRetention(createdAtIso: string, retainDays: number, now = new Date()): boolean {
  const created = new Date(createdAtIso)
  if (Number.isNaN(created.getTime())) return false
  const cutoff = new Date(now.getTime() - retainDays * 24 * 60 * 60 * 1000)
  return created < cutoff
}

/** Destructive tenant operations must refuse while legal hold is active. */
export function assertDestructiveAllowed(policy: RetentionPolicy): { ok: true } | { ok: false; reason: string } {
  if (policy.legalHold) {
    return { ok: false, reason: "Legal hold is active; deletion and destructive exit are blocked" }
  }
  return { ok: true }
}
