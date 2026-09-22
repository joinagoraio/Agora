/**
 * Markdown / outline → print-ready HTML (browser Print → Save as PDF).
 * No Chromium dependency — stakeholder PDF path for local/dev.
 */

import { exportPageChromeCss } from "@/lib/export/export-page-chrome"
import {
  groupExportChapters,
  markdownToExportSections,
  type DocxExportSection,
  type ExportFootnote,
} from "@/lib/export/markdown-to-docx"
import { DEFAULT_PROGRAMME_PAGE_CHROME, type ProgrammePageChromeSettings } from "@/lib/programme/page-chrome"

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function inlineMarkdownToHtml(line: string, footnotes: ExportFootnote[] = []): string {
  const known = new Set(footnotes.map((note) => note.id))
  const marked = line.replace(/\[\^(\d+)\]/g, (token, id) =>
    known.has(Number(id)) ? `\u0000fn${id}\u0000` : token,
  )
  const parts: string[] = []
  const boldRe = /\*\*(.+?)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = boldRe.exec(marked)) !== null) {
    parts.push(escapeHtml(marked.slice(last, match.index)))
    parts.push(`<strong>${escapeHtml(match[1])}</strong>`)
    last = match.index + match[0].length
  }
  parts.push(escapeHtml(marked.slice(last)))
  return parts.join("").replace(/\u0000fn(\d+)\u0000/g, (_token, id) => `<sup id="fnref-${id}"><a href="#fn-${id}">${id}</a></sup>`)
}

function bodyLinesToHtml(body: string, footnotes: ExportFootnote[] = []): string {
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
      listItems.push(inlineMarkdownToHtml(ul[1], footnotes))
      continue
    }
    if (ol) {
      if (listType && listType !== "ol") flushList()
      listType = "ol"
      listItems.push(inlineMarkdownToHtml(ol[1], footnotes))
      continue
    }
    flushList()
    chunks.push(`<p>${inlineMarkdownToHtml(line, footnotes)}</p>`)
  }
  flushList()
  return chunks.join("\n")
}

export function buildPrintHtmlFromSections(
  title: string,
  sections: DocxExportSection[],
  footnotes: ExportFootnote[] = [],
  pageChrome: ProgrammePageChromeSettings = DEFAULT_PROGRAMME_PAGE_CHROME,
): string {
  const headingTag = (level: 1 | 2 | 3) => `h${level}` as const
  const chapters = groupExportChapters(title, sections)
  const notes =
    footnotes.length === 0
      ? ""
      : `<section class="footnotes"><ol>${footnotes
          .map((note) => `<li id="fn-${note.id}">${escapeHtml(note.text)}</li>`)
          .join("")}</ol></section>`
  const rendered = chapters.length > 0 ? chapters : [{ title: "", pieces: [] }]
  const body = rendered
    .map((chapter, index) => {
      const pieces = chapter.pieces
        .map((piece) => {
          const tag = headingTag(piece.level)
          const heading = piece.heading ? `<${tag}>${escapeHtml(piece.heading)}</${tag}>\n` : ""
          return `${heading}${bodyLinesToHtml(piece.body, footnotes)}`
        })
        .join("\n")
      const titleBlock = index === 0 ? `<div class="doc-title">${escapeHtml(title)}</div>\n` : ""
      const notesBlock = index === rendered.length - 1 ? notes : ""
      return `<section class="export-chapter c${index}">\n${titleBlock}${pieces}\n${notesBlock}</section>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    ${exportPageChromeCss(rendered.map((chapter) => chapter.title), title, pageChrome)}
    body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; color: #111; margin: 0; }
    h1 { font-size: 1.75rem; margin: 1.5rem 0 0.75rem; }
    h2 { font-size: 1.35rem; margin: 1.25rem 0 0.5rem; }
    h3 { font-size: 1.15rem; margin: 1rem 0 0.5rem; }
    p { margin: 0.5rem 0; }
    ul, ol { margin: 0.5rem 0 0.5rem 1.25rem; }
    sup a { text-decoration: none; color: inherit; }
    .footnotes { margin-top: 2rem; border-top: 1px solid #ccc; font-size: 0.92rem; }
    .doc-title { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
    .export-chapter + .export-chapter { break-before: page; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  ${body}
</body>
</html>`
}

export function markdownToPrintHtml(
  title: string,
  markdown: string,
  footnotes: ExportFootnote[] = [],
  pageChrome: ProgrammePageChromeSettings = DEFAULT_PROGRAMME_PAGE_CHROME,
): string {
  return buildPrintHtmlFromSections(title, markdownToExportSections(markdown), footnotes, pageChrome)
}
