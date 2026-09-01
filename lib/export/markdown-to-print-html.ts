/**
 * Markdown / outline → print-ready HTML (browser Print → Save as PDF).
 * No Chromium dependency — stakeholder PDF path for local/dev.
 */

import { markdownToExportSections, type DocxExportSection } from "@/lib/export/markdown-to-docx"

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function inlineMarkdownToHtml(line: string): string {
  const parts: string[] = []
  const boldRe = /\*\*(.+?)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = boldRe.exec(line)) !== null) {
    parts.push(escapeHtml(line.slice(last, match.index)))
    parts.push(`<strong>${escapeHtml(match[1])}</strong>`)
    last = match.index + match[0].length
  }
  parts.push(escapeHtml(line.slice(last)))
  return parts.join("")
}

function bodyLinesToHtml(body: string): string {
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return ""
  const chunks: string[] = []
  let listType: "ul" | "ol" | null = null
  let listItems: string[] = []

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null
      listItems = []
      return
    }
    const tag = listType
    chunks.push(`<${tag}>${listItems.map((i) => `<li>${i}</li>`).join("")}</${tag}>`)
    listType = null
    listItems = []
  }

  for (const line of lines) {
    const ul = line.match(/^[-*]\s+(.+)$/)
    const ol = line.match(/^\d+\.\s+(.+)$/)
    if (ul) {
      if (listType && listType !== "ul") flushList()
      listType = "ul"
      listItems.push(inlineMarkdownToHtml(ul[1]))
      continue
    }
    if (ol) {
      if (listType && listType !== "ol") flushList()
      listType = "ol"
      listItems.push(inlineMarkdownToHtml(ol[1]))
      continue
    }
    flushList()
    chunks.push(`<p>${inlineMarkdownToHtml(line)}</p>`)
  }
  flushList()
  return chunks.join("\n")
}

export function buildPrintHtmlFromSections(title: string, sections: DocxExportSection[]): string {
  const headingTag = (level: 1 | 2 | 3) => `h${level}` as const
  const body = sections
    .map((section) => {
      const tag = headingTag(section.level ?? 1)
      return `<${tag}>${escapeHtml(section.heading)}</${tag}>\n${bodyLinesToHtml(section.body)}`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; color: #111; max-width: 72ch; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 1.75rem; margin: 1.5rem 0 0.75rem; }
    h2 { font-size: 1.35rem; margin: 1.25rem 0 0.5rem; }
    h3 { font-size: 1.15rem; margin: 1rem 0 0.5rem; }
    p { margin: 0.5rem 0; }
    ul, ol { margin: 0.5rem 0 0.5rem 1.25rem; }
    .doc-title { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="doc-title">${escapeHtml(title)}</div>
  ${body}
</body>
</html>`
}

export function markdownToPrintHtml(title: string, markdown: string): string {
  return buildPrintHtmlFromSections(title, markdownToExportSections(markdown))
}
