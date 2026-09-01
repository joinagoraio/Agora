/**
 * Markdown / outline → DOCX via JSZip (OOXML).
 * Supports headings, paragraphs, lists, and inline bold.
 */

import JSZip from "jszip"

export type DocxExportSection = {
  heading: string
  level?: 1 | 2 | 3
  body: string
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function runsFromInlineMarkdown(text: string): string {
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
  if (parts.length === 0) {
    parts.push(`<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`)
  }
  return parts.join("")
}

function paragraph(text: string, style?: string, listNumPr?: string): string {
  const pPrBits: string[] = []
  if (style) pPrBits.push(`<w:pStyle w:val="${style}"/>`)
  if (listNumPr) pPrBits.push(listNumPr)
  const pStyle = pPrBits.length ? `<w:pPr>${pPrBits.join("")}</w:pPr>` : ""
  return `<w:p>${pStyle}${runsFromInlineMarkdown(text)}</w:p>`
}

function headingStyle(level: 1 | 2 | 3): string {
  return `Heading${level}`
}

function bodyToParagraphs(body: string): string[] {
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
        ),
      )
      continue
    }
    out.push(paragraph(line))
  }
  return out
}

/**
 * Build a minimal but valid .docx buffer from titled sections.
 */
export async function buildDocxFromSections(
  title: string,
  sections: DocxExportSection[],
): Promise<Buffer> {
  const body: string[] = [paragraph(title, "Title")]

  for (const section of sections) {
    const level = section.level ?? 1
    body.push(paragraph(section.heading, headingStyle(level)))
    body.push(...bodyToParagraphs(section.body))
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body.join("\n    ")}
    <w:sectPr>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
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
    if (raw.trim()) {
      current.body = current.body ? `${current.body}\n${raw.trim()}` : raw.trim()
    }
  }
  flush()
  return sections
}
