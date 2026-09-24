import type { TextPage } from "@/lib/documents/text-pages"

export type WorkupHeading = { key: string; label: string; instruction?: string }

export type InterestCitation = { documentId: string; pageNumber?: number; sectionId?: string; quote?: string }

export type ProgrammeInterest = {
  id: string
  workspaceId: string
  reference: string | null
  label: string
  summary: string | null
  citations: InterestCitation[]
  selected: boolean
  sortOrder: number
  origin: "extracted" | "manual"
  workupDocumentId: string | null
}

export type FoundInterest = {
  reference: string | null
  label: string
  summary: string | null
  citation: InterestCitation
}

/** Used when a programme structure has no headings of its own. */
export const DEFAULT_WORKUP_HEADINGS: Record<"Dutch" | "English", WorkupHeading[]> = {
  Dutch: [
    { key: "basis", label: "Onderbouwing" },
    { key: "ambitions", label: "Ambities en opgaven" },
    { key: "measures", label: "Beleidskeuzes, maatregelen en rol" },
    { key: "policy", label: "Bestaand beleid" },
    { key: "area", label: "Gebiedsgerichte uitwerking" },
    { key: "resources", label: "Uitvoerbaarheid en middelen" },
    { key: "coherence", label: "Samenhang met andere belangen" },
    { key: "monitoring", label: "Monitoring en bijstelling" },
  ],
  English: [
    { key: "basis", label: "Justification" },
    { key: "ambitions", label: "Ambitions and challenges" },
    { key: "measures", label: "Policy choices, measures, and role" },
    { key: "policy", label: "Existing policy" },
    { key: "area", label: "Area-specific detail" },
    { key: "resources", label: "Feasibility and resources" },
    { key: "coherence", label: "Links with other interests" },
    { key: "monitoring", label: "Monitoring and adjustment" },
  ],
}

export function parseWorkupHeadings(raw: unknown): WorkupHeading[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const label = typeof row.label === "string" ? row.label.trim() : ""
    if (!label) return []
    const key = typeof row.key === "string" && row.key.trim() ? row.key.trim() : `h${index + 1}`
    const instruction = typeof row.instruction === "string" && row.instruction.trim() ? row.instruction.trim() : undefined
    return [{ key, label, ...(instruction ? { instruction } : {}) }]
  })
}

export function mapInterestRow(row: Record<string, unknown>): ProgrammeInterest {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    reference: typeof row.reference === "string" ? row.reference : null,
    label: String(row.label),
    summary: typeof row.summary === "string" ? row.summary : null,
    citations: Array.isArray(row.citations) ? (row.citations as InterestCitation[]) : [],
    selected: row.selected === true,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    origin: row.origin === "manual" ? "manual" : "extracted",
    workupDocumentId: typeof row.workup_document_id === "string" ? row.workup_document_id : null,
  }
}

/** Link free-text interest names (as a model or person wrote them) to interest records. */
export function matchInterestIds(
  names: string[],
  interests: Array<{ id: string; reference: string | null; label: string }>,
): string[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim()
  const ids = new Set<string>()
  for (const name of names) {
    const text = normalize(name)
    if (!text) continue
    const byLabel = interests.find((interest) => {
      const label = normalize(interest.label)
      return label.length > 8 && (text.includes(label) || (text.length > 12 && label.includes(text)))
    })
    if (byLabel) {
      ids.add(byLabel.id)
      continue
    }
    const number = text.match(/(?:^|\D)(\d{1,3})(?:\D|$)/)?.[1]
    const byReference = number ? interests.find((interest) => interest.reference === number) : undefined
    if (byReference) ids.add(byReference.id)
  }
  return [...ids]
}

/** "Provinciaal belang 15: …", "Belang 3. …", "Principle 2: …" */
const NUMBERED_INTEREST =
  /^((?:[A-Za-zÀ-ÿ]+\s+)?(?:belang|principe|uitgangspunt|interest|principle))\s+(\d{1,3})\s*[:.]\s+(.+)$/i
const LABEL_LINE = /^[A-Za-zÀ-ÿ]{3,20}:\s/
const CONNECTOR = /(?:\b(?:van|en|de|het|met|voor|op|in|aan|tot|bij|of|the|of|and|for|to|with|a|an)|[,\-–])$/i

/**
 * Find interests a vision lists with a number. Titles that wrap over lines are joined;
 * the text that follows (often a motivation) becomes the summary.
 */
export function findNumberedInterests(pages: TextPage[], documentId: string): FoundInterest[] {
  const found = new Map<string, FoundInterest>()
  for (const page of pages) {
    const lines = page.text.split("\n").map((line) => line.trim())
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index]!.match(NUMBERED_INTEREST)
      if (!match) continue
      const reference = match[2]!
      if (found.has(reference)) continue
      let title = match[3]!.trim()
      let cursor = index + 1
      while (cursor < lines.length && title.split(/\s+/).length < 30) {
        const next = lines[cursor]!
        if (!next || NUMBERED_INTEREST.test(next) || LABEL_LINE.test(next)) break
        const continues = /^[a-zà-ÿ]/.test(next) || CONNECTOR.test(title)
        if (!continues) break
        title = `${title} ${next}`
        cursor += 1
      }
      const summaryLines: string[] = []
      for (let rest = cursor; rest < lines.length && summaryLines.join(" ").length < 400; rest += 1) {
        const next = lines[rest]!
        if (!next || NUMBERED_INTEREST.test(next)) break
        summaryLines.push(next)
      }
      const summary = summaryLines.join(" ").replace(/^[A-Za-zÀ-ÿ]{3,20}:\s*/, "").replace(/\s+/g, " ").trim()
      found.set(reference, {
        reference,
        label: title.replace(/\s+/g, " ").trim(),
        summary: summary ? summary.slice(0, 400) : null,
        citation: { documentId, pageNumber: page.pageNumber, quote: lines[index] },
      })
    }
  }
  return [...found.values()].sort((a, b) => Number(a.reference) - Number(b.reference))
}
