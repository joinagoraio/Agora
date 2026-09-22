import { stripDuplicateChapterHeading } from "@/lib/programme/chapter-heading"
import { findProgrammeCitationMarkers, programmeCitationLabel } from "@/lib/programme/citation-display"
import type { ProgrammeOutlineNode } from "@/lib/programme/domain"

export type ComposeChapter = {
  node: ProgrammeOutlineNode
  title: string
  html: string
}

export type ComposeMeasure = {
  id: string
  title: string
  measureType: string
  specificAction: string
  narrative?: string | null
  outlineNodeId?: string | null
  citations: Array<{ documentId: string; quote?: string; pageNumber?: number; sectionId?: string }>
  workflowStatus: string
}

export function htmlToPlain(html: string): string {
  return (html || "")
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n\n## $1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function plainWithCitationFootnotes(
  plain: string,
  footnoteFor: (citation: ComposeMeasure["citations"][number]) => number,
): string {
  const hits = findProgrammeCitationMarkers(plain)
  if (hits.length === 0) return plain
  let cursor = 0
  let next = ""
  for (const hit of hits) {
    next += plain.slice(cursor, hit.start)
    const number = footnoteFor({
      documentId: hit.citation.documentId || "",
      quote: hit.citation.quote,
      pageNumber: hit.citation.pageNumber,
    })
    next += `[^${number}]`
    cursor = hit.end
  }
  next += plain.slice(cursor)
  return next
}

export function composeProgrammeMarkdown(input: {
  title: string
  nodes: ProgrammeOutlineNode[]
  chapters: ComposeChapter[]
  measures: ComposeMeasure[]
  citationLabels?: Record<string, string>
}): string {
  const chapterByNode = new Map(input.chapters.map((c) => [c.node.id, c]))
  const footnotes: string[] = []
  const footnoteFor = (citation: ComposeMeasure["citations"][number]) => {
    const key = `${citation.documentId}|${citation.sectionId || ""}|${citation.pageNumber || ""}|${citation.quote || ""}`
    const existing = footnotes.findIndex((line) => line.startsWith(key))
    if (existing >= 0) return existing + 1
    const stored = input.citationLabels?.[citation.documentId] || citation.documentId
    const label = programmeCitationLabel({
      title: stored,
      pageNumber: /p\.\d+/.test(stored) ? null : citation.pageNumber,
      index: footnotes.length + 1,
    })
    const quote = citation.quote ? ` — “${citation.quote}”` : ""
    footnotes.push(`${key}::${label}${quote}`)
    return footnotes.length
  }
  const parts = [`# ${input.title}`, ""]

  for (const node of input.nodes) {
    const headingLevel = node.parentId ? "###" : "##"
    parts.push(`${headingLevel} ${node.title}`)
    if (node.required) parts.push("*Required section*")
    const chapter = chapterByNode.get(node.id)
    if (chapter?.html) {
      parts.push(
        plainWithCitationFootnotes(
          htmlToPlain(stripDuplicateChapterHeading(chapter.html, node.title)),
          footnoteFor,
        ),
      )
    } else if (node.purpose) {
      parts.push(htmlToPlain(node.purpose))
    } else {
      parts.push("*(No chapter draft yet.)*")
    }
    const nodeMeasures = input.measures.filter((m) => m.outlineNodeId === node.id)
    if (nodeMeasures.length > 0) {
      parts.push("#### Measures in this section")
      for (const measure of nodeMeasures) {
        const marks = measure.citations.map((citation) => `[^${footnoteFor(citation)}]`).join("")
        parts.push(`- **${measure.title}** (${measure.measureType}): ${measure.specificAction}${marks}`)
      }
    }
    parts.push("")
  }

  const unplaced = input.measures.filter((m) => !m.outlineNodeId || !input.nodes.some((n) => n.id === m.outlineNodeId))
  if (unplaced.length > 0) {
    parts.push("## Measures appendix")
    for (const measure of unplaced) {
      parts.push(`### ${measure.title}`)
      parts.push(`Type: ${measure.measureType}`)
      parts.push(measure.specificAction)
      if (measure.narrative) parts.push(measure.narrative)
      if (measure.citations.length) {
        const marks = measure.citations.map((citation) => `[^${footnoteFor(citation)}]`).join(" ")
        parts.push(marks)
      }
      parts.push("")
    }
  }

  if (footnotes.length) {
    parts.push("")
    footnotes.forEach((line, index) => {
      const body = line.split("::")[1] || line
      parts.push(`[^${index + 1}]: ${body}`)
    })
    parts.push("")
  }

  return parts.join("\n").trim() + "\n"
}

export function composeCitationGraph(measures: ComposeMeasure[]) {
  const nodes = new Map<string, { id: string; kind: "measure" | "document" | "section"; label: string }>()
  const edges: Array<{ from: string; to: string; quote?: string; pageNumber?: number }> = []
  for (const measure of measures) {
    nodes.set(measure.id, { id: measure.id, kind: "measure", label: measure.title })
    for (const citation of measure.citations) {
      nodes.set(citation.documentId, {
        id: citation.documentId,
        kind: "document",
        label: citation.documentId,
      })
      if (citation.sectionId) {
        nodes.set(citation.sectionId, { id: citation.sectionId, kind: "section", label: citation.sectionId })
      }
      edges.push({
        from: measure.id,
        to: citation.sectionId || citation.documentId,
        quote: citation.quote,
        pageNumber: citation.pageNumber,
      })
    }
  }
  return { nodes: [...nodes.values()], edges }
}

export function redactForClassification(markdown: string, blockedTitles: string[]): string {
  if (blockedTitles.length === 0) return markdown
  const note = `\n\n> Classification: excluded sources — ${blockedTitles.join(", ")}\n`
  return markdown + note
}
