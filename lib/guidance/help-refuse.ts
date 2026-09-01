const REFUSE_PATTERNS: RegExp[] = [
  /\bwrite\b.{0,40}\bchapter\b/i,
  /\bdraft\b.{0,40}\b(chapter|section|measure|policy)\b/i,
  /\bschrijf\b.{0,40}\bhoofdstuk\b/i,
  /\bkeur\b.{0,40}\bgoed\b/i,
  /\bapprove\b.{0,40}\b(chapter|measure|this|the)\b/i,
  /\bgenerate\b.{0,40}\b(measure|chapter|draft|policy)\b/i,
  /\bgenereer\b.{0,40}\b(maatregel|hoofdstuk)\b/i,
  /\bbind\b.{0,40}\b(vision|document|policy|source)\b/i,
  /\bkoppel\b.{0,40}\b(visie|document|bron)\b/i,
  /\bfill\b.{0,40}\b(chapter|programme|program)\b/i,
  /\bexport\b.{0,40}\b(word|pdf|docx|audit)\b/i,
  /\bchange\b.{0,40}\b(binding|measure|chapter)\b/i,
]

export function shouldRefuseHelpQuery(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return REFUSE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export const HELP_REFUSAL_COPY_EN =
  "I can only explain how to use Agora. I cannot draft policy, approve work, or change programme content. Use the programme assistant or the current tab for that."
