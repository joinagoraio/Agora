import {
  isConsultationCommentStatus,
  TERMINAL_CONSULTATION_STATUSES,
  type ConsultationCommentStatus,
  type TerminalConsultationStatus,
} from "@/lib/programme/consultation"

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "if",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "please",
  "that",
  "the",
  "this",
  "to",
  "too",
  "was",
  "we",
  "well",
  "will",
  "with",
  "you",
  "your",
  "een",
  "het",
  "de",
  "van",
  "en",
  "een",
  "voor",
  "niet",
  "ook",
])

export type ClusterableComment = {
  id: string
  quoteText: string
  body: string
  clusterId: string | null
  locked: boolean
}

export type ProposedCluster = {
  memberIds: string[]
  reuseClusterId: string | null
  label: string
  confidence: number
}

export type ClusterDraft = {
  label: string
  summary: string
  suggestedResponse: string
  suggestedStatus: ConsultationCommentStatus
}

export function tokenizeConsultationText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
}

export function normalizeConsultationQuote(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

export function jaccardSimilarity(left: string[], right: string[]): number {
  const a = new Set(left)
  const b = new Set(right)
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const token of a) {
    if (b.has(token)) inter += 1
  }
  return inter / (a.size + b.size - inter)
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i] ?? 0
    const b = right[i] ?? 0
    dot += a * b
    leftNorm += a * a
    rightNorm += b * b
  }
  if (!leftNorm || !rightNorm) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function commentTokens(comment: ClusterableComment): string[] {
  return tokenizeConsultationText(`${comment.quoteText} ${comment.body}`)
}

function groupLabel(comments: ClusterableComment[]): string {
  const quote = comments[0]?.quoteText.trim()
  if (quote) return quote.length > 72 ? `${quote.slice(0, 69)}…` : quote
  const counts = new Map<string, number>()
  for (const comment of comments) {
    for (const token of commentTokens(comment)) {
      counts.set(token, (counts.get(token) || 0) + 1)
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([token]) => token)
  return top.length ? top.join(" · ") : "Consultation topic"
}

function groupConfidence(comments: ClusterableComment[]): number {
  if (comments.length <= 1) return 1
  const quotes = new Set(comments.map((comment) => normalizeConsultationQuote(comment.quoteText)).filter(Boolean))
  if (quotes.size === 1) return 0.92
  const tokenSets = comments.map(commentTokens)
  let total = 0
  let pairs = 0
  for (let i = 0; i < tokenSets.length; i += 1) {
    for (let j = i + 1; j < tokenSets.length; j += 1) {
      total += jaccardSimilarity(tokenSets[i] || [], tokenSets[j] || [])
      pairs += 1
    }
  }
  return pairs === 0 ? 0 : Number((total / pairs).toFixed(3))
}

export function proposeConsultationClusters(
  comments: ClusterableComment[],
  threshold = 0.28,
): ProposedCluster[] {
  const locked = comments.filter((comment) => comment.locked)
  const unlocked = comments.filter((comment) => !comment.locked)
  const used = new Set<string>()
  const groups: ClusterableComment[][] = []

  for (const seed of unlocked) {
    if (used.has(seed.id)) continue
    const group = [seed]
    used.add(seed.id)
    for (const other of unlocked) {
      if (used.has(other.id)) continue
      const sameQuote =
        Boolean(normalizeConsultationQuote(seed.quoteText)) &&
        normalizeConsultationQuote(seed.quoteText) === normalizeConsultationQuote(other.quoteText)
      const similar = jaccardSimilarity(commentTokens(seed), commentTokens(other)) >= threshold
      if (sameQuote || similar) {
        group.push(other)
        used.add(other.id)
      }
    }
    groups.push(group)
  }

  const lockedByCluster = new Map<string, ClusterableComment[]>()
  for (const comment of locked) {
    if (!comment.clusterId) {
      groups.push([comment])
      continue
    }
    const current = lockedByCluster.get(comment.clusterId) || []
    current.push(comment)
    lockedByCluster.set(comment.clusterId, current)
  }

  const proposed: ProposedCluster[] = []
  for (const [clusterId, members] of lockedByCluster) {
    proposed.push({
      memberIds: members.map((comment) => comment.id),
      reuseClusterId: clusterId,
      label: groupLabel(members),
      confidence: groupConfidence(members),
    })
  }

  for (const group of groups) {
    let reuseClusterId: string | null = null
    let best = 0
    for (const [clusterId, members] of lockedByCluster) {
      const score = jaccardSimilarity(commentTokens(group[0]!), commentTokens(members[0]!))
      const sameQuote =
        normalizeConsultationQuote(group[0]?.quoteText || "") ===
        normalizeConsultationQuote(members[0]?.quoteText || "")
      if ((sameQuote || score >= threshold) && score >= best) {
        best = score
        reuseClusterId = clusterId
      }
    }
    if (reuseClusterId) {
      const existing = proposed.find((item) => item.reuseClusterId === reuseClusterId)
      if (existing) {
        existing.memberIds.push(...group.map((comment) => comment.id))
        continue
      }
    }
    proposed.push({
      memberIds: group.map((comment) => comment.id),
      reuseClusterId,
      label: groupLabel(group),
      confidence: groupConfidence(group),
    })
  }

  return proposed
}

export function nearestClusterId(input: {
  comment: ClusterableComment
  clusters: Array<{ id: string; sample: ClusterableComment }>
  threshold?: number
}): string | null {
  const threshold = input.threshold ?? 0.28
  let bestId: string | null = null
  let best = 0
  for (const cluster of input.clusters) {
    const sameQuote =
      Boolean(normalizeConsultationQuote(input.comment.quoteText)) &&
      normalizeConsultationQuote(input.comment.quoteText) ===
        normalizeConsultationQuote(cluster.sample.quoteText)
    const score = jaccardSimilarity(commentTokens(input.comment), commentTokens(cluster.sample))
    if ((sameQuote || score >= threshold) && score >= best) {
      best = sameQuote ? Math.max(score, 0.9) : score
      bestId = cluster.id
    }
  }
  return bestId
}

export function parseClusterDraft(raw: string): ClusterDraft | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const label = typeof parsed.label === "string" ? parsed.label.trim() : ""
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const suggestedResponse =
      typeof parsed.suggestedResponse === "string"
        ? parsed.suggestedResponse.trim()
        : typeof parsed.suggested_response === "string"
          ? parsed.suggested_response.trim()
          : ""
    const statusRaw = parsed.suggestedStatus ?? parsed.suggested_status
    const suggestedStatus = isConsultationCommentStatus(statusRaw) ? statusRaw : "in_discussion"
    if (!label || !summary) return null
    return { label, summary, suggestedResponse, suggestedStatus }
  } catch {
    return null
  }
}

export function fallbackClusterDraft(input: { label: string; comments: ClusterableComment[] }): ClusterDraft {
  const first = input.comments[0]
  return {
    label: input.label,
    summary: first
      ? `${input.comments.length} comments on “${first.quoteText}”. ${first.body}`
      : `${input.comments.length} comments on this topic.`,
    suggestedResponse: "Review this topic and record a decision with a reason.",
    suggestedStatus: "in_discussion",
  }
}

const DUTCH_DECISIONS: Record<string, string> = {
  accepted: "overgenomen",
  accepted_with_modification: "overgenomen met een aanpassing",
  rejected: "niet overgenomen",
  merged: "samengevoegd met een andere reactie",
  out_of_scope: "valt buiten dit programma",
  in_discussion: "nog in behandeling",
}

export function buildPublicTopicSummaryDraft(input: {
  language?: "nl" | "en"
  commentCount: number
  clusters: Array<{
    label: string
    memberCount: number
    summary: string | null
    ownerSummary: string | null
    appliedStatus: string | null
  }>
}): string {
  const dutch = input.language === "nl"
  const lines = dutch
    ? [
        `# Wat we met de reacties hebben gedaan`,
        ``,
        `${input.commentCount} ${input.commentCount === 1 ? "reactie" : "reacties"} ontvangen, over ${input.clusters.length} ${input.clusters.length === 1 ? "onderwerp" : "onderwerpen"}.`,
        ``,
      ]
    : [
        `# Consultation topics`,
        ``,
        `${input.commentCount} ${input.commentCount === 1 ? "comment" : "comments"} received across ${input.clusters.length} ${input.clusters.length === 1 ? "topic" : "topics"}.`,
        ``,
      ]
  for (const cluster of input.clusters) {
    const decision = dutch
      ? cluster.appliedStatus
        ? `Besluit: ${DUTCH_DECISIONS[cluster.appliedStatus] ?? cluster.appliedStatus.replaceAll("_", " ")}.`
        : "Nog geen besluit."
      : cluster.appliedStatus
        ? `Decision: ${cluster.appliedStatus.replaceAll("_", " ")}.`
        : "Awaiting a decision."
    const count = dutch
      ? `${cluster.memberCount} ${cluster.memberCount === 1 ? "reactie" : "reacties"}.`
      : `${cluster.memberCount} ${cluster.memberCount === 1 ? "comment" : "comments"}.`
    lines.push(`## ${cluster.label}`)
    lines.push(``)
    lines.push(`${count} ${decision}`)
    lines.push(``)
    if (cluster.summary) {
      lines.push(cluster.summary)
      lines.push(``)
    }
    if (cluster.ownerSummary && cluster.ownerSummary !== cluster.summary) {
      lines.push(`${dutch ? "Toelichting van de provincie" : "The province's reasoning"}: ${cluster.ownerSummary}`)
      lines.push(``)
    }
  }
  return lines.join("\n").trim() + "\n"
}

export function canSubmitConsultationAppeal(input: {
  isAuthor: boolean
  status: ConsultationCommentStatus
  hasPendingAppeal: boolean
  body: string
}): { ok: true } | { ok: false; reason: string } {
  if (!input.isAuthor) return { ok: false, reason: "Only the commenter can appeal this decision" }
  if (!TERMINAL_CONSULTATION_STATUSES.includes(input.status as TerminalConsultationStatus)) {
    return { ok: false, reason: "Appeal only after a decision is recorded" }
  }
  if (input.hasPendingAppeal) return { ok: false, reason: "An appeal is already waiting for the document owner" }
  if (!input.body.trim()) return { ok: false, reason: "Say why you are appealing" }
  return { ok: true }
}

export function canReviewConsultationAppeal(outcome: string): outcome is "reopen" | "upheld" {
  return outcome === "reopen" || outcome === "upheld"
}
