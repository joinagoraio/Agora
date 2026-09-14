export type HelpDocumentTitle = {
  title: string
  role: string | null
}

export type HelpFormatLanguage = "en" | "nl"

export type HelpFormatOptions = {
  documentTitles?: HelpDocumentTitle[]
  language?: HelpFormatLanguage
  topic?: string | null
  question?: string | null
}

const ROLE_LABELS: Record<HelpFormatLanguage, Record<string, string>> = {
  en: {
    environmental_vision: "Environmental vision",
    environmental_effects_report: "Environmental effects report",
    programme_handbook: "Programme handbook",
    existing_policy: "Existing policy",
    housing_programme: "Housing programme",
    quality_style_rules: "Quality and style rules",
    other: "Other",
  },
  nl: {
    environmental_vision: "Omgevingsvisie",
    environmental_effects_report: "Milieueffectrapport",
    programme_handbook: "Programmahandboek",
    existing_policy: "Bestaand beleid",
    housing_programme: "Woonprogramma",
    quality_style_rules: "Kwaliteits- en stijlregels",
    other: "Overig",
  },
}

const ROLE_ALIASES: Record<string, keyof (typeof ROLE_LABELS)["en"]> = {
  handbook: "programme_handbook",
  "programme handbook": "programme_handbook",
  "effects report": "environmental_effects_report",
  effects_report: "environmental_effects_report",
  vision: "environmental_vision",
  "environmental vision": "environmental_vision",
}

const LIST_INTRO =
  /^(in (your|this) programme[, ]+)?(the following|these) (documents|sources|files) are bound:?$/i
const LIST_INTRO_NL = /^(in dit programma[, ]+)?(de volgende|deze) documenten (zijn gebonden|staan gebonden):?$/i
const BINDINGS_TOPIC = /\b(bound documents?|bindings?|gebonden documenten|bronbinding)/i
const NAVIGATE_LINE = /(?:^|\n)NAVIGATE:\s*\S+[ \t]*/gi

export const HELP_FORMAT_SKILL = `FORMAT (code-owned — always follow):
- Reply in Markdown. Never one continuous paragraph.
- Start with a short heading: ## Topic
- Then 1–2 short body paragraphs.
- When you name more than two items (documents, steps, roles, or places to click), use a Markdown list.
- Bound documents: one list item each, written as "- **Title** (role)". Use the titles and roles from context only.
- End how-to answers with a short next step (where to click). Keep NAVIGATE on its own last line when used.
- Do not wrap the answer in a code fence. Do not invent document titles.`

export function normalizeHelpQuery(term: string): string {
  return term
    .trim()
    .replace(/[?.!]+$/g, "")
    .replace(/^(what is|what are|what's|wat is|wat zijn|which are|which|welke zijn|welke|tell me about|explain)\s+/i, "")
    .replace(/^(the|de|het)\s+/i, "")
    .replace(/\s+(in this programme|in this program|in dit programma|here|in agora)$/i, "")
    .replace(/\s+(tab|sheet|tool|menu|section)$/i, "")
    .trim()
}

export function formatRoleLabel(role: string | null | undefined, language: HelpFormatLanguage = "en"): string | null {
  if (!role?.trim()) return null
  const raw = role.trim()
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_")
  const aliased = ROLE_ALIASES[raw.toLowerCase()] ?? ROLE_ALIASES[key.replace(/_/g, " ")]
  const mapped = ROLE_LABELS[language][aliased ?? key]
  if (mapped) return mapped
  if (key === "fixture") return language === "nl" ? "Bron" : "Source"
  return raw.replace(/_/g, " ")
}

export function formatBoundDocumentList(
  documents: HelpDocumentTitle[],
  language: HelpFormatLanguage = "en",
): string {
  return documents
    .map((document) => {
      const role = formatRoleLabel(document.role, language)
      return role ? `- **${document.title}** (${role})` : `- **${document.title}**`
    })
    .join("\n")
}

export function composeGlossaryHelp(
  topic: string,
  definition: string,
  options: HelpFormatOptions = {},
): string {
  const language = options.language ?? "en"
  const heading = glossaryHeading(topic, language)
  const titles = options.documentTitles ?? []
  if ((topic === "bindings" || topic === "documents") && titles.length > 0) {
    const inThis = language === "nl" ? "In dit programma" : "In this programme"
    const next =
      language === "nl"
        ? "Om bindingen te bekijken of te wijzigen, open Kennis → Bestanden."
        : "To review or change these bindings, open Knowledge → Files."
    return joinHelpBlocks([
      `## ${heading}`,
      definition,
      `### ${inThis}`,
      formatBoundDocumentList(titles, language),
      next,
    ])
  }
  return compileHelpAnswer(`## ${heading}\n\n${definition}`, {
    language,
    topic,
    question: options.question,
  })
}

export function compileHelpAnswer(text: string, options: HelpFormatOptions = {}): string {
  const language = options.language ?? "en"
  const titles = options.documentTitles ?? []
  const navigate = extractNavigate(text)
  let body = text.replace(NAVIGATE_LINE, "\n").trim()
  if (!body) return navigate ?? ""

  const topic = options.topic ?? inferHelpTopic(body, options.question)
  const aboutBindings = topic === "bindings" || BINDINGS_TOPIC.test(body)

  if (aboutBindings && titles.length > 0) {
    body = injectCanonicalDocumentList(body, titles, language)
  } else {
    body = promoteDocumentLinesToList(body, titles, language)
  }

  body = structureHelpProse(body, {
    language,
    topic,
    question: options.question,
    preferBindingsHeading: aboutBindings,
  })

  body = normalizeHelpMarkdown(body)
  return navigate ? `${body}\n\nNAVIGATE: ${navigate}` : body
}

function glossaryHeading(topic: string, language: HelpFormatLanguage): string {
  const headings: Record<HelpFormatLanguage, Record<string, string>> = {
    en: {
      authority: "Authority",
      programme: "Programme",
      documents: "Documents",
      research: "Research",
      bindings: "Bound documents",
      specialist: "Specialist",
      job: "Job",
      members: "Members",
      documentOwner: "Document owner",
      chapterOwner: "Chapter owner",
      read: "Read",
      documentEdit: "Edit",
      focus: "Focus",
      guided: "Guided",
      expert: "Expert",
      published: "Published",
      analysis: "Analysis",
      knowledge: "Knowledge",
      ask: "Ask",
      structure: "Structure",
      measures: "Measures",
      effects: "Effects",
      provenance: "Provenance",
      review: "Review",
      consultation: "Consultation",
      export: "Export",
      publish: "Publish",
      comments: "Comments",
      configuration: "Configuration",
      agents: "Agents",
      status: "Status",
    },
    nl: {
      authority: "Bevoegd gezag",
      programme: "Programma",
      documents: "Documenten",
      research: "Onderzoek",
      bindings: "Gebonden documenten",
      specialist: "Specialist",
      job: "Rol in de interface",
      members: "Leden",
      documentOwner: "Documenteigenaar",
      chapterOwner: "Hoofdstukeigenaar",
      read: "Lezen",
      documentEdit: "Bewerken",
      focus: "Focus",
      guided: "Begeleid",
      expert: "Expert",
      published: "Gepubliceerd",
      analysis: "Analyse",
      knowledge: "Kennis",
      ask: "Ask",
      structure: "Structuur",
      measures: "Maatregelen",
      effects: "Effecten",
      provenance: "Herkomst",
      review: "Review",
      consultation: "Consultatie",
      export: "Export",
      publish: "Publiceren",
      comments: "Opmerkingen",
      configuration: "Configuratie",
      agents: "Specialisten",
      status: "Status",
    },
  }
  return headings[language][topic] ?? titleCaseHelp(topic)
}

function inferHelpTopic(text: string, question?: string | null): string | null {
  if (BINDINGS_TOPIC.test(text) || (question && BINDINGS_TOPIC.test(question))) return "bindings"
  if (!question) return null
  const key = normalizeHelpQuery(question).toLowerCase()
  if (!key || key.split(/\s+/).length > 4 || /^(how|hoe|can|where|waar|why|waarom)\b/.test(key)) {
    return null
  }
  return key
}

function titleCaseHelp(value: string): string {
  return value
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && /^(and|or|of|the|a|an|to|in|on|en|de|het|een)$/i.test(word)) {
        return word.toLowerCase()
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

function headingFromQuestion(question: string | undefined | null, language: HelpFormatLanguage): string | null {
  if (!question?.trim()) return null
  const key = normalizeHelpQuery(question)
  if (!key || key.length > 48 || key.split(/\s+/).length > 6) return null
  if (/^(how|hoe|can|where|waar|why|waarom)\b/i.test(key) && key.split(/\s+/).length > 4) return null
  return glossaryHeading(key.toLowerCase(), language)
}

function structureHelpProse(
  text: string,
  options: {
    language: HelpFormatLanguage
    topic?: string | null
    question?: string | null
    preferBindingsHeading?: boolean
  },
): string {
  const existing = text.match(/^#{1,2}\s+(.+)\s*$/m)
  const heading =
    existing?.[1]?.trim() ||
    (options.topic ? glossaryHeading(options.topic, options.language) : null) ||
    headingFromQuestion(options.question, options.language) ||
    (options.preferBindingsHeading
      ? options.language === "nl"
        ? "Gebonden documenten"
        : "Bound documents"
      : null)

  const rest = text.replace(/^#{1,2}\s+.+\s*\n+/, "").trim()
  if (!rest) return heading ? `## ${heading}` : text

  if (/(^|\n)\s*(?:[-*+]|\d+\.)\s+/.test(rest)) {
    return heading ? joinHelpBlocks([`## ${heading}`, rest]) : text
  }

  const paragraphs = rest.split(/\n\n+/).filter(Boolean)
  const prose = prepareHelpProse(paragraphs.filter((paragraph) => !/^#{1,3}\s/.test(paragraph)).join(" "))
  const sentences = splitHelpSentences(prose)
  if (sentences.length <= 2) {
    return heading ? joinHelpBlocks([`## ${heading}`, rest]) : text
  }

  return joinHelpBlocks([heading ? `## ${heading}` : null, ...splitDefinitionAndFacts(sentences)])
}

function prepareHelpProse(text: string): string {
  return text
    .replace(/[—–]\s*([a-z])/g, (_match, letter: string) => `. ${letter.toUpperCase()}`)
    .replace(/\s+but\s+(it does not|it cannot|it never)/gi, (_match, clause: string) => {
      return `. ${clause.charAt(0).toUpperCase()}${clause.slice(1)}`
    })
}

function splitHelpSentences(text: string): string[] {
  const protectedText = text.replace(/\b(e\.g|i\.e|vs|etc)\./gi, (match) => match.replace(".", "∯"))
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý])/)
    .map((part) => part.replace(/∯/g, ".").trim())
    .filter(Boolean)
}

function splitDefinitionAndFacts(sentences: string[]): string[] {
  const body = [sentences[0]]
  let index = 1
  if (sentences[1] && isDefinitionFollowOn(sentences[1])) {
    body.push(sentences[1])
    index = 2
  }
  const rest = sentences.slice(index)
  if (rest.length === 0) return [body.join(" ")]

  let next: string | null = null
  if (rest.length > 0 && isNextStepSentence(rest[rest.length - 1])) {
    next = rest.pop() ?? null
  }
  const facts = rest.map((sentence) => `- ${sentence.replace(/[.]$/, "")}`)
  return [body.join(" "), facts.length ? facts.join("\n") : null, next].filter(Boolean) as string[]
}

function isDefinitionFollowOn(sentence: string): boolean {
  if (isNextStepSentence(sentence)) return false
  if (/\b(does not|cannot|never|must not)\b/i.test(sentence)) return false
  return /^(it is|it’s|this is|that is|these are|het is|dit is)\b/i.test(sentence)
}

function isNextStepSentence(sentence: string): boolean {
  return /^(to |om |open |click |klik |go to |use the |you can )/i.test(sentence.trim())
}

function extractNavigate(text: string): string | null {
  const match = text.match(/NAVIGATE:\s*(\S+)/i)
  return match?.[1] ?? null
}

function injectCanonicalDocumentList(
  text: string,
  titles: HelpDocumentTitle[],
  language: HelpFormatLanguage,
): string {
  const lines = splitHelpLines(text)
  const kept: string[] = []

  for (const line of lines) {
    if (isListIntro(line)) continue
    if (isDocumentItemLine(line, titles)) continue
    const scrubbed = scrubTitlesFromLine(line, titles)
    if (scrubbed) kept.push(scrubbed)
  }

  const inThis = language === "nl" ? "In dit programma" : "In this programme"
  const list = formatBoundDocumentList(titles, language)
  const sectionHeading = `### ${inThis}`

  const nextIndex = kept.findIndex((line) => isNextStepLine(line))
  if (nextIndex === -1) {
    return joinHelpBlocks([...kept, sectionHeading, list])
  }
  const before = kept.slice(0, nextIndex)
  const after = kept.slice(nextIndex)
  return joinHelpBlocks([...before, sectionHeading, list, ...after])
}

function promoteDocumentLinesToList(
  text: string,
  titles: HelpDocumentTitle[],
  language: HelpFormatLanguage,
): string {
  const lines = splitHelpLines(text)
  const out: string[] = []
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length >= 2) {
      out.push(
        buffer
          .map((line) => formatLooseDocumentLine(line, language))
          .join("\n"),
      )
    } else {
      out.push(...buffer)
    }
    buffer = []
  }

  for (const line of lines) {
    if (isListIntro(line)) {
      flush()
      continue
    }
    if (isDocumentItemLine(line, titles) || isTitleRoleLine(line)) {
      buffer.push(line)
      continue
    }
    flush()
    out.push(line)
  }
  flush()
  return joinHelpBlocks(out)
}

function formatLooseDocumentLine(line: string, language: HelpFormatLanguage): string {
  const stripped = stripListMarker(line)
  const parsed = parseTitleRole(stripped)
  const role = formatRoleLabel(parsed.role, language)
  if (stripped.startsWith("**") && (stripped.includes("(") || stripped.includes("—"))) {
    return stripped.startsWith("- ") ? stripped : `- ${stripped}`
  }
  return role ? `- **${parsed.title}** (${role})` : `- **${parsed.title}**`
}

function parseTitleRole(line: string): { title: string; role: string | null } {
  const match = line.match(/^(.+?)\s+\(([^)]+)\)\s*$/)
  if (match) return { title: match[1].trim(), role: match[2].trim() }
  const em = line.match(/^\*{0,2}(.+?)\*{0,2}\s+[—–-]\s+(.+)$/)
  if (em) return { title: em[1].replace(/\*/g, "").trim(), role: em[2].trim() }
  return { title: line.replace(/\*/g, "").trim(), role: null }
}

function scrubTitlesFromLine(line: string, titles: HelpDocumentTitle[]): string {
  if (/^#{1,3}\s/.test(line)) return line
  let next = line
  for (const document of titles) {
    const escaped = document.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    next = next.replace(new RegExp(`${escaped}\\s*(?:\\([^)]+\\))?`, "gi"), " ")
  }
  next = next
    .replace(LIST_INTRO, " ")
    .replace(LIST_INTRO_NL, " ")
    .replace(/\b(and|en|or|of)\s+$/gi, "")
    .replace(/\s+\b(and|en|or|of)\s+are bound\.?/gi, ".")
    .replace(/\s+are bound\.?/gi, ".")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s+and\s+/gi, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/[:;,]\s*$/g, "")
    .replace(/\.\s*\./g, ".")
    .trim()
  if (!next || isListIntro(next) || next.length < 12) return ""
  return next
}

function isListIntro(line: string): boolean {
  const text = stripListMarker(line).replace(/[*_]/g, "")
  return LIST_INTRO.test(text) || LIST_INTRO_NL.test(text)
}

function isNextStepLine(line: string): boolean {
  return /^(to |om |open |klik |click )/i.test(stripListMarker(line))
}

function isTitleRoleLine(line: string): boolean {
  const text = stripListMarker(line)
  if (!text || text.length > 160) return false
  if (/[.!?]$/.test(text)) return false
  return /^.+\s+\([^)]{2,40}\)$/.test(text)
}

function isDocumentItemLine(line: string, titles: HelpDocumentTitle[]): boolean {
  if (isTitleRoleLine(line)) return true
  if (titles.length === 0) return false
  const parsed = parseTitleRole(stripListMarker(line))
  const needle = parsed.title.toLowerCase()
  return titles.some((document) => document.title.toLowerCase() === needle)
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim()
}

function splitHelpLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]?.length > 0))
}

function joinHelpBlocks(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("\n\n")
}

function normalizeHelpMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
