export type VisionAnchor = {
  label: string
  nodeType: "ambition" | "provincial_interest" | "goal"
}

export function splitAnchorList(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/\W+/).filter((token) => token.length > 3))
}

export function titlesOverlap(left: string, right: string, minShared = 2): boolean {
  const a = tokens(left)
  const b = tokens(right)
  let shared = 0
  for (const token of a) {
    if (b.has(token)) shared++
  }
  return shared >= minShared
}

/**
 * Resolve graph anchors a measure should contribute to.
 * Explicit registry fields win; matching coverage findings can add more.
 */
export function resolveMeasureVisionAnchors(input: {
  title: string
  contributesToVision?: string[]
  provincialInterests?: string[]
  findings?: Array<{ summary: string; visionAnchor?: string; provincialInterest?: string }>
}): VisionAnchor[] {
  const out: VisionAnchor[] = []
  const seen = new Set<string>()
  const add = (label: string | undefined, nodeType: VisionAnchor["nodeType"]) => {
    const trimmed = label?.trim()
    if (!trimmed) return
    const key = `${nodeType}:${trimmed.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ label: trimmed, nodeType })
  }

  for (const label of input.contributesToVision || []) add(label, "ambition")
  for (const label of input.provincialInterests || []) add(label, "provincial_interest")

  const explicitEmpty = (input.contributesToVision || []).every((label) => !label.trim())
  for (const finding of input.findings || []) {
    const hay = [finding.summary, finding.visionAnchor, finding.provincialInterest].filter(Boolean).join(" ")
    const related =
      titlesOverlap(input.title, hay) ||
      (finding.visionAnchor &&
        (input.contributesToVision || []).some((label) => label.toLowerCase() === finding.visionAnchor!.toLowerCase()))
    if (!related && !explicitEmpty) continue
    if (related || (explicitEmpty && titlesOverlap(input.title, hay))) {
      add(finding.visionAnchor, "ambition")
      add(finding.provincialInterest, "provincial_interest")
      if (explicitEmpty && !finding.visionAnchor) add(finding.summary, "ambition")
    }
  }

  return out
}
