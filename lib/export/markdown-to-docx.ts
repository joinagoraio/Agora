/**
 * Markdown / outline → DOCX via JSZip (OOXML).
 * Supports headings, paragraphs, lists, and inline bold.
 */

import JSZip from "jszip"
import { buildDocxPageChrome, type DocxPageChrome } from "@/lib/export/export-page-chrome"
import { DEFAULT_PROGRAMME_PAGE_CHROME, type ProgrammePageChromeSettings } from "@/lib/programme/page-chrome"

export type DocxExportSection = {
  heading: string
  level?: 1 | 2 | 3
  body: string
}

export type ExportFootnote = {
  id: number
  text: string
}

const FOOTNOTE_DEF = /^\[\^(\d+)\]:\s*(.*)$/

export function takeExportFootnotes(markdown: string): { markdown: string; footnotes: ExportFootnote[] } {
  const footnotes: ExportFootnote[] = []
  const lines = markdown.split("\n").filter((line) => {
    const match = line.match(FOOTNOTE_DEF)
    if (!match) return true
    footnotes.push({ id: Number(match[1]), text: match[2].trim() })
    return false
  })
  return { markdown: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", footnotes }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function textRuns(text: string): string {
  const parts: string[] = []
  const boldRe = /\*\*(.+?)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(`<w:r><w:t xml:space="preserve">${escapeXml(text.slice(last, match.index))}</w:t></w:r>`)
    }
    parts.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(match[1])}</w:t></w:r>`)
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push(`<w:r><w:t xml:space="preserve">${escapeXml(text.slice(last))}</w:t></w:r>`)
  }
  if (parts.length === 0 && text.length === 0) return ""
  return parts.join("")
}

function runsFromInlineMarkdown(text: string, footnotes: ExportFootnote[]): string {
  const known = new Set(footnotes.map((note) => note.id))
  return text
    .split(/(\[\^\d+\])/g)
    .map((chunk) => {
      const marker = chunk.match(/^\[\^(\d+)\]$/)
      if (!marker) return textRuns(chunk)
      const id = Number(marker[1])
      if (!known.has(id)) return textRuns(chunk)
      return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`
    })
    .join("")
}

function paragraph(text: string, style?: string, listNumPr?: string, footnotes: ExportFootnote[] = []): string {
  const pPrBits: string[] = []
  if (style) pPrBits.push(`<w:pStyle w:val="${style}"/>`)
  if (listNumPr) pPrBits.push(listNumPr)
  const pStyle = pPrBits.length ? `<w:pPr>${pPrBits.join("")}</w:pPr>` : ""
  return `<w:p>${pStyle}${runsFromInlineMarkdown(text, footnotes)}</w:p>`
}

function headingStyle(level: 1 | 2 | 3): string {
  return `Heading${level}`
}

function bodyToParagraphs(body: string, footnotes: ExportFootnote[]): string[] {
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  for (const line of lines) {
    const ul = line.match(/^[-*]\s+(.+)$/)
    const ol = line.match(/^\d+\.\s+(.+)$/)
    if (ul) {
      out.push(
        paragraph(
          ul[1],
          undefined,
          `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`,
          footnotes,
        ),
      )
      continue
    }
    if (ol) {
      out.push(
        paragraph(
          ol[1],
          undefined,
          `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>`,
          footnotes,
        ),
      )
      continue
    }
    out.push(paragraph(line, undefined, undefined, footnotes))
  }
  return out
}

/**
 * Build a minimal but valid .docx buffer from titled sections.
 */
function footnotesXml(footnotes: ExportFootnote[]): string {
  const separator = `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>`
  const continuation = `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`
  const notes = footnotes
    .map(
      (note) => `<w:footnote w:id="${note.id}"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${escapeXml(note.text)}</w:t></w:r></w:p></w:footnote>`,
    )
    .join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${separator}${continuation}${notes}</w:footnotes>`
}

/** Drop a leading heading that repeats the document title, so the title is printed once. */
export function sectionsWithoutRepeatedTitle(title: string, sections: DocxExportSection[]): DocxExportSection[] {
  const first = sections[0]
  if (!first || first.heading.trim() !== title.trim()) return sections
  if (!first.body.trim()) return sections.slice(1)
  return [{ ...first, heading: "" }, ...sections.slice(1)]
}

export type ExportChapter = {
  title: string
  pieces: Array<{ heading: string; level: 1 | 2 | 3; body: string }>
}

/** Group outline sections into chapters. A level-2 heading starts a new chapter. */
export function groupExportChapters(title: string, sections: DocxExportSection[]): ExportChapter[] {
  const chapters: ExportChapter[] = []
  let current: ExportChapter | null = null
  const open = (chapterTitle: string) => {
    current = { title: chapterTitle, pieces: [] }
    chapters.push(current)
    return current
  }
  for (const section of sectionsWithoutRepeatedTitle(title, sections)) {
    const level = section.level ?? 1
    if (level === 2) {
      const chapter = open(section.heading)
      chapter.pieces.push({ heading: section.heading, level, body: section.body })
      continue
    }
    const chapter = current ?? open("")
    chapter.pieces.push({ heading: section.heading, level, body: section.body })
  }
  return chapters.filter((chapter) => chapter.pieces.some((piece) => piece.heading || piece.body.trim()))
}

function chapterParagraphs(chapter: ExportChapter, footnotes: ExportFootnote[]): string[] {
  const body: string[] = []
  for (const piece of chapter.pieces) {
    const level = piece.level ?? 1
    if (piece.heading) body.push(paragraph(piece.heading, headingStyle(level)))
    body.push(...bodyToParagraphs(piece.body, footnotes))
  }
  return body
}

export async function buildDocxFromSections(
  title: string,
  sections: DocxExportSection[],
  footnotes: ExportFootnote[] = [],
  pageChrome: ProgrammePageChromeSettings = DEFAULT_PROGRAMME_PAGE_CHROME,
): Promise<Buffer> {
  const chapters = groupExportChapters(title, sections)
  const chrome: DocxPageChrome = buildDocxPageChrome({
    chapterTitles: chapters.map((chapter) => chapter.title),
    programmeName: title,
    chrome: pageChrome,
    relationshipStart: footnotes.length ? 4 : 3,
  })
  const body: string[] = [paragraph(title, "Title")]
  chapters.forEach((chapter, index) => {
    body.push(...chapterParagraphs(chapter, footnotes))
    if (index < chapters.length - 1) {
      body.push(`<w:p><w:pPr>${chrome.sectionProperties[index]}</w:pPr></w:p>`)
    }
  })
  const closing = chrome.sectionProperties[chapters.length - 1] ?? chrome.sectionProperties[0]

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${body.join("\n    ")}
    ${closing}
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  ${footnotes.length ? `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` : ""}
  ${chrome.contentTypes}
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  ${footnotes.length ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>` : ""}
  ${chrome.relationships}
</Relationships>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

  const zip = new JSZip()
  zip.file("[Content_Types].xml", contentTypes)
  zip.folder("_rels")?.file(".rels", rels)
  const word = zip.folder("word")
  word?.file("document.xml", documentXml)
  word?.file("styles.xml", styles)
  word?.file("numbering.xml", numbering)
  if (footnotes.length) word?.file("footnotes.xml", footnotesXml(footnotes))
  for (const file of chrome.files) word?.file(file.path, file.xml)
  if (chrome.settingsXml) word?.file("settings.xml", chrome.settingsXml)
  word?.folder("_rels")?.file("document.xml.rels", docRels)

  return zip.generateAsync({ type: "nodebuffer" })
}

/**
 * Parse a simple markdown document into export sections (headings + following paragraphs).
 */
export function markdownToExportSections(markdown: string): DocxExportSection[] {
  const lines = markdown.split(/\n/)
  const sections: DocxExportSection[] = []
  let current: DocxExportSection | null = null

  const flush = () => {
    if (current) sections.push(current)
    current = null
  }

  for (const raw of lines) {
    const heading = raw.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flush()
      current = {
        heading: heading[2].trim(),
        level: heading[1].length as 1 | 2 | 3,
        body: "",
      }
      continue
    }
    if (!current) {
      current = { heading: "Introduction", level: 1, body: "" }
    }
    if (FOOTNOTE_DEF.test(raw.trim())) continue
    if (raw.trim()) {
      current.body = current.body ? `${current.body}\n${raw.trim()}` : raw.trim()
    }
  }
  flush()
  return sections
}
