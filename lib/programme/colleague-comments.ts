/**
 * Colleague notes on the live draft. Reply and group similar notes so the
 * author can prepare the text for later consultation.
 * Not the consultation ledger on a published snapshot.
 */

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
  "voor",
  "niet",
  "ook",
])

export type ColleagueCommentThemeRecord = {
  id: string
  label: string
  summary: string | null
  suggestedReply: string | null
  addressed: boolean
  commentCount: number
}

export type ClusterableColleagueComment = {
  id: string
  body: string
  quote?: string
  themeId: string | null
  locked: boolean
}

export type ProposedColleagueTheme = {
  memberIds: string[]
  reuseThemeId: string | null
  label: string
  confidence: number
}

export type ColleagueThemeDraft = {
  label: string
  summary: string
  suggestedReply: string
}

export function nestColleagueComments<T extends { id: string; parentId: string | null }>(
  comments: T[],
): Array<T & { replies: T[] }> {
  const repliesByParent = new Map<string, T[]>()
  const roots: T[] = []
  for (const comment of comments) {
    if (comment.parentId) {
      const list = repliesByParent.get(comment.parentId) || []
      list.push(comment)
      repliesByParent.set(comment.parentId, list)
      continue
    }
    roots.push(comment)
  }
  return roots.map((root) => ({
    ...root,
    replies: repliesByParent.get(root.id) || [],
  }))
}

export function rootColleagueCommentId(
  comment: { id: string; parentId: string | null },
  byId: Map<string, { id: string; parentId: string | null }>,
): string {
  let current = comment
  const seen = new Set<string>()
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return current.id
}

export function tokenizeColleagueComment(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
}

export function colleagueCommentJaccard(left: string[], right: string[]): number {
  const a = new Set(left)
  const b = new Set(right)
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const token of a) {
    if (b.has(token)) inter += 1
  }
  return inter / (a.size + b.size - inter)
}

function commentTokens(comment: ClusterableColleagueComment): string[] {
  return tokenizeColleagueComment(`${comment.quote || ""} ${comment.body}`)
}

function themeLabel(comments: ClusterableColleagueComment[]): string {
  const quote = comments[0]?.quote?.trim()
  if (quote) return quote.length > 72 ? `${quote.slice(0, 69)}…` : quote
  const counts = new Map<string, number>()
  for (const comment of comments) {
    for (const token of commentTokens(comment)) {
      counts.set(token, (counts.get(token) || 0) + 1)
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([token]) => token)
  return top.length ? top.join(" · ") : "Colleague notes"
}

function themeConfidence(comments: ClusterableColleagueComment[]): number {
  if (comments.length <= 1) return 1
  const tokenSets = comments.map(commentTokens)
  let total = 0
  let pairs = 0
  for (let i = 0; i < tokenSets.length; i += 1) {
    for (let j = i + 1; j < tokenSets.length; j += 1) {
      total += colleagueCommentJaccard(tokenSets[i] || [], tokenSets[j] || [])
      pairs += 1
    }
  }
  return pairs === 0 ? 0 : Number((total / pairs).toFixed(3))
}

export function proposeColleagueCommentThemes(
  comments: ClusterableColleagueComment[],
  threshold = 0.28,
): ProposedColleagueTheme[] {
  const locked = comments.filter((comment) => comment.locked)
  const unlocked = comments.filter((comment) => !comment.locked)
  const used = new Set<string>()
  const groups: ClusterableColleagueComment[][] = []

  for (const seed of unlocked) {
    if (used.has(seed.id)) continue
    const group = [seed]
    used.add(seed.id)
    for (const other of unlocked) {
      if (used.has(other.id)) continue
      if (colleagueCommentJaccard(commentTokens(seed), commentTokens(other)) >= threshold) {
        group.push(other)
        used.add(other.id)
      }
    }
    groups.push(group)
  }

  const lockedByTheme = new Map<string, ClusterableColleagueComment[]>()
  for (const comment of locked) {
    if (!comment.themeId) {
      if (comment.body.trim()) groups.push([comment])
      continue
    }
    const current = lockedByTheme.get(comment.themeId) || []
    current.push(comment)
    lockedByTheme.set(comment.themeId, current)
  }

  const proposed: ProposedColleagueTheme[] = []
  for (const [themeId, members] of lockedByTheme) {
    proposed.push({
      memberIds: members.map((comment) => comment.id),
      reuseThemeId: themeId,
      label: themeLabel(members),
      confidence: themeConfidence(members),
    })
  }

  for (const group of groups) {
    if (group.length < 2) continue
    let reuseThemeId: string | null = null
    let best = 0
    for (const [themeId, members] of lockedByTheme) {
      const score = colleagueCommentJaccard(commentTokens(group[0]!), commentTokens(members[0]!))
      if (score >= threshold && score >= best) {
        best = score
        reuseThemeId = themeId
      }
    }
    if (reuseThemeId) {
      const existing = proposed.find((item) => item.reuseThemeId === reuseThemeId)
      if (existing) {
        existing.memberIds.push(...group.map((comment) => comment.id))
        continue
      }
    }
    proposed.push({
      memberIds: group.map((comment) => comment.id),
      reuseThemeId,
      label: themeLabel(group),
      confidence: themeConfidence(group),
    })
  }

  return proposed
}

export function parseColleagueThemeDraft(raw: string): ColleagueThemeDraft | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const label = typeof parsed.label === "string" ? parsed.label.trim() : ""
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const suggestedReply =
      typeof parsed.suggestedReply === "string"
        ? parsed.suggestedReply.trim()
        : typeof parsed.suggested_reply === "string"
          ? parsed.suggested_reply.trim()
          : ""
    if (!label || !summary) return null
    return { label, summary, suggestedReply }
  } catch {
    return null
  }
}

export function fallbackColleagueThemeDraft(input: {
  label: string
  comments: ClusterableColleagueComment[]
}): ColleagueThemeDraft {
  const first = input.comments[0]
  const count = input.comments.length
  return {
    label: input.label,
    summary: first
      ? `${count} colleague notes. ${first.body}`
      : `${count} colleague notes on this theme.`,
    suggestedReply: "Address this in the live draft, then mark the notes as addressed before consultation.",
  }
}
