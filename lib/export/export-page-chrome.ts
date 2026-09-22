/**
 * Page chrome shared by Word and PDF export.
 * Matches the Pages view: a centered running header (the chapter title, or custom
 * header text), a footer (custom text, or the programme name), and a page number.
 * The header is omitted on a chapter's opening page in Word. Chromium only omits
 * it on the document's first page.
 */

import {
  DEFAULT_PROGRAMME_PAGE_CHROME,
  formatProgrammeChromeLabel,
  programmePageRunningFooter,
  type ProgrammePageChromeSettings,
  type ProgrammePageNumberPosition,
} from "@/lib/programme/page-chrome"

const A4_WIDTH = 11906
const MARGIN_X = 907
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2
const CENTER_TAB = Math.round(CONTENT_WIDTH / 2)
const RIGHT_TAB = CONTENT_WIDTH

const HALF_POINTS: Record<ProgrammePageChromeSettings["size"], number> = {
  xs: 16,
  sm: 18,
  base: 22,
}

const FONT_PT: Record<ProgrammePageChromeSettings["size"], string> = {
  xs: "8pt",
  sm: "9pt",
  base: "11pt",
}

type NumberSide = "left" | "center" | "right" | "none"

export function exportChromeHeaderLabel(chapterTitle: string, chrome: ProgrammePageChromeSettings): string {
  if (!chrome.showHeader) return ""
  return formatProgrammeChromeLabel(chrome.headerText.trim() || chapterTitle)
}

function numberSide(page: "odd" | "even", position: ProgrammePageNumberPosition): NumberSide {
  if (position === "hidden") return "none"
  if (position === "center") return "center"
  if (position === "outside") return page === "odd" ? "right" : "left"
  return page === "odd" ? "left" : "right"
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function chromeRunProps(halfPoints: number): string {
  return `<w:rPr><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/><w:color w:val="666666"/></w:rPr>`
}

function headerXml(text: string, halfPoints: number): string {
  const run = text
    ? `<w:r>${chromeRunProps(halfPoints)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
    : ""
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run}</w:p></w:hdr>`
}

function pageField(halfPoints: number): string {
  const props = chromeRunProps(halfPoints)
  return `<w:r>${props}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${props}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${props}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${props}<w:t>1</w:t></w:r><w:r>${props}<w:fldChar w:fldCharType="end"/></w:r>`
}

function footerXml(label: string, side: NumberSide, halfPoints: number): string {
  const props = chromeRunProps(halfPoints)
  const text = label ? `<w:r>${props}<w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>` : ""
  const tab = `<w:r>${props}<w:tab/></w:r>`
  const page = pageField(halfPoints)
  let pPr = `<w:pPr><w:tabs><w:tab w:val="center" w:pos="${CENTER_TAB}"/><w:tab w:val="right" w:pos="${RIGHT_TAB}"/></w:tabs></w:pPr>`
  let inner = ""
  if (side === "none") {
    pPr = `<w:pPr><w:jc w:val="center"/></w:pPr>`
    inner = text
  } else if (side === "center") {
    inner = `${text}${tab}${page}`
  } else if (side === "right") {
    inner = `${tab}${text}${tab}${page}`
  } else {
    inner = `${page}${tab}${text}`
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>${pPr}${inner}</w:p></w:ftr>`
}

export type DocxPageChrome = {
  files: Array<{ path: string; xml: string }>
  contentTypes: string
  relationships: string
  settingsXml: string | null
  sectionProperties: string[]
}

export function buildDocxPageChrome(input: {
  chapterTitles: string[]
  programmeName: string
  chrome?: ProgrammePageChromeSettings
  relationshipStart: number
}): DocxPageChrome {
  const chrome = input.chrome ?? DEFAULT_PROGRAMME_PAGE_CHROME
  const titles = input.chapterTitles.length > 0 ? input.chapterTitles : [""]
  const halfPoints = HALF_POINTS[chrome.size]
  const footer = programmePageRunningFooter(input.programmeName, chrome)
  const mirrored = chrome.pageNumbers === "outside" || chrome.pageNumbers === "inside"
  const labels = titles.map((title) => exportChromeHeaderLabel(title, chrome))
  const hasHeader = labels.some((label) => label.length > 0)

  let nextId = input.relationshipStart
  const rid = () => `rId${nextId++}`
  const files: Array<{ path: string; xml: string }> = []
  const relationships: string[] = []
  const contentTypes: string[] = []

  const addPart = (path: string, xml: string, kind: "header" | "footer") => {
    const id = rid()
    files.push({ path, xml })
    relationships.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${kind}" Target="${path}"/>`,
    )
    contentTypes.push(
      `<Override PartName="/word/${path}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`,
    )
    return id
  }

  let firstHeaderId = ""
  if (hasHeader) {
    firstHeaderId = addPart("header-first.xml", headerXml("", halfPoints), "header")
  }
  const headerIds = labels.map((label, index) =>
    label ? addPart(`header-${index}.xml`, headerXml(label, halfPoints), "header") : "",
  )

  const showNumber = chrome.pageNumbers !== "hidden"
  const oddFooterId =
    footer || showNumber ? addPart("footer-odd.xml", footerXml(footer, numberSide("odd", chrome.pageNumbers), halfPoints), "footer") : ""
  const evenFooterId =
    mirrored && oddFooterId
      ? addPart("footer-even.xml", footerXml(footer, numberSide("even", chrome.pageNumbers), halfPoints), "footer")
      : ""

  let settingsXml: string | null = null
  if (mirrored) {
    settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:evenAndOddHeaders/></w:settings>`
    const settingsId = rid()
    relationships.push(
      `<Relationship Id="${settingsId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
    )
    contentTypes.push(
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`,
    )
  }

  const sectionProperties = labels.map((label, index) => {
    const headerId = headerIds[index]
    const refs = [
      headerId ? `<w:headerReference w:type="default" r:id="${headerId}"/>` : "",
      headerId && mirrored ? `<w:headerReference w:type="even" r:id="${headerId}"/>` : "",
      headerId && firstHeaderId ? `<w:headerReference w:type="first" r:id="${firstHeaderId}"/>` : "",
      oddFooterId ? `<w:footerReference w:type="default" r:id="${oddFooterId}"/>` : "",
      evenFooterId ? `<w:footerReference w:type="even" r:id="${evenFooterId}"/>` : "",
      oddFooterId && firstHeaderId ? `<w:footerReference w:type="first" r:id="${oddFooterId}"/>` : "",
      `<w:pgSz w:w="${A4_WIDTH}" w:h="16838"/>`,
      `<w:pgMar w:top="1020" w:right="${MARGIN_X}" w:bottom="1020" w:left="${MARGIN_X}" w:header="567" w:footer="567" w:gutter="0"/>`,
      headerId ? `<w:titlePg/>` : "",
      index < labels.length - 1 ? `<w:type w:val="nextPage"/>` : "",
    ]
    return `<w:sectPr>${refs.filter(Boolean).join("")}</w:sectPr>`
  })

  return {
    files,
    contentTypes: contentTypes.join(""),
    relationships: relationships.join(""),
    settingsXml,
    sectionProperties,
  }
}

function marginBoxes(header: string, footer: string, side: NumberSide, font: string): string {
  const text = (value: string) =>
    `content: ${cssString(value)}; font-size: ${font}; letter-spacing: 0.08em; color: #666;`
  const number = `content: counter(page); font-size: ${font}; color: #666;`
  const none = "content: none;"
  const top = header ? `@top-center { ${text(header)} }` : `@top-center { ${none} }`
  if (side === "none") {
    return `${top} @bottom-left { ${none} } @bottom-center { ${footer ? text(footer) : none} } @bottom-right { ${none} }`
  }
  if (side === "center") {
    return `${top} @bottom-left { ${footer ? text(footer) : none} } @bottom-center { ${number} } @bottom-right { ${none} }`
  }
  if (side === "right") {
    return `${top} @bottom-left { ${none} } @bottom-center { ${footer ? text(footer) : none} } @bottom-right { ${number} }`
  }
  return `${top} @bottom-left { ${number} } @bottom-center { ${footer ? text(footer) : none} } @bottom-right { ${none} }`
}

export function exportPageChromeCss(chapterTitles: string[], programmeName: string, chrome: ProgrammePageChromeSettings = DEFAULT_PROGRAMME_PAGE_CHROME): string {
  const titles = chapterTitles.length > 0 ? chapterTitles : [""]
  const font = FONT_PT[chrome.size]
  const footer = programmePageRunningFooter(programmeName, chrome)
  const rules = [`@page { size: A4; margin: 18mm 16mm 18mm 16mm; }`]
  titles.forEach((title, index) => {
    const header = exportChromeHeaderLabel(title, chrome)
    const name = `c${index}`
    rules.push(`@page ${name}:right { ${marginBoxes(header, footer, numberSide("odd", chrome.pageNumbers), font)} }`)
    rules.push(`@page ${name}:left { ${marginBoxes(header, footer, numberSide("even", chrome.pageNumbers), font)} }`)
    if (index === 0) {
      rules.push(`@page ${name}:first { @top-center { content: none; } }`)
    }
    rules.push(`.${name} { page: ${name}; }`)
  })
  return rules.join("\n")
}
