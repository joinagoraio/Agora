/** Prompts and parsing for the demo colleagues and residents, kept apart from the database so they can be tested. */

export type DemoParagraph = { documentId: string; blockId: string; chapter: string; text: string }

type Person = { slug: string; name: string; role: string }

export type DemoNotePlan = {
  notes: Array<{ paragraph: number; author: string; body: string }>
  replies: Array<{ to: number; author: string; body: string }>
}

export type DemoResponse = { author: string; quote: string; body: string }

function people(list: Person[]) {
  return list.map((person) => `- ${person.slug}: ${person.name}, ${person.role}`).join("\n")
}

function readJson(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

export function colleagueNotesMessages(language: "nl" | "en", colleagues: Person[], paragraphs: DemoParagraph[]) {
  const system =
    language === "nl"
      ? `Je schrijft voor een demonstratie realistische notities van collega's bij een concept-omgevingsprogramma van de provincie Flevoland.\n\nDe collega's:\n${people(colleagues)}\n\nSchrijf 12 notities in het Nederlands. Vier punten worden door meerdere collega's los van elkaar gemaakt: elk punt door twee of drie verschillende collega's, in hun eigen woorden en vanuit hun eigen vak, bij de alinea waar het speelt; dat mag een andere alinea zijn. Daarnaast twee notities die op zichzelf staan. Een notitie is kort, één of twee zinnen, gaat concreet over de tekst van die alinea en is opbouwend, zoals collega's dat in Word doen. Schrijf ook twee korte reacties van een collega op de notitie van een ander: eens, of een aanvulling. Verzin geen feiten of cijfers die niet in de tekst staan; vraag er liever naar.\n\nGeef alleen JSON: {"notes":[{"paragraph":1,"author":"slug","body":""}],"replies":[{"to":1,"author":"slug","body":""}]}. Alinea's en notities zijn genummerd vanaf 1.`
      : `For a demonstration, you write realistic notes from colleagues on a draft environmental programme of the province of Flevoland.\n\nThe colleagues:\n${people(colleagues)}\n\nWrite 12 notes in English. Four points are made by several colleagues independently: each point by two or three different colleagues, in their own words and from their own field, on the paragraph where it applies; that may be a different paragraph. Add two notes that stand alone. A note is short, one or two sentences, is specific to the text of that paragraph, and is constructive, the way colleagues comment in Word. Also write two short replies from one colleague to another's note: agreeing, or adding something. Do not invent facts or figures that are not in the text; ask for them instead.\n\nReturn JSON only: {"notes":[{"paragraph":1,"author":"slug","body":""}],"replies":[{"to":1,"author":"slug","body":""}]}. Paragraphs and notes are numbered from 1.`
  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: JSON.stringify(paragraphs.map((paragraph, index) => ({ n: index + 1, chapter: paragraph.chapter, text: paragraph.text.slice(0, 600) }))),
    },
  ]
}

/** Keeps notes on known paragraphs by known colleagues; numbers become zero-based positions. */
export function parseDemoNotes(raw: string, paragraphCount: number, slugs: string[]): DemoNotePlan {
  const parsed = readJson(raw)
  const known = new Set(slugs)
  const notes: DemoNotePlan["notes"] = []
  for (const entry of Array.isArray(parsed?.notes) ? parsed.notes : []) {
    const row = (entry ?? {}) as Record<string, unknown>
    const paragraph = Number(row.paragraph) - 1
    const author = text(row.author)
    const body = text(row.body)
    if (!Number.isInteger(paragraph) || paragraph < 0 || paragraph >= paragraphCount || !known.has(author) || !body) continue
    notes.push({ paragraph, author, body })
  }
  const replies: DemoNotePlan["replies"] = []
  for (const entry of Array.isArray(parsed?.replies) ? parsed.replies : []) {
    const row = (entry ?? {}) as Record<string, unknown>
    const to = Number(row.to) - 1
    const author = text(row.author)
    const body = text(row.body)
    if (!Number.isInteger(to) || to < 0 || to >= notes.length || !known.has(author) || !body) continue
    if (notes[to]!.author === author) continue
    replies.push({ to, author, body })
  }
  return { notes, replies }
}

function plain(markdown: string) {
  return markdown
    .replace(/\[\^[^\]]*\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** The readable paragraphs of a published programme, without headings, tables or short lines. */
export function publishedPassages(markdown: string, limit = 50): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("#") && !block.startsWith("|") && !/^[-*_]{3,}$/.test(block))
    .map((block) => plain(block.replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")))
    .filter((passage) => passage.length >= 80)
    .slice(0, limit)
}

export function residentResponsesMessages(language: "nl" | "en", residents: Person[], passages: string[], earlierQuotes: string[]) {
  const earlier = earlierQuotes
    .map((quote) => ({ quote, passage: passages.findIndex((passage) => normalise(passage).includes(normalise(quote))) + 1 }))
    .filter((item) => item.passage > 0)
  const earlierNote =
    earlier.length === 0
      ? ""
      : language === "nl"
        ? `\n\nEr is al gereageerd op: ${earlier.map((item) => `passage ${item.passage} ("${item.quote.slice(0, 160)}")`).join("; ")}. Laat twee of drie insprekers op dezelfde passage reageren, met hetzelfde citaat.`
        : `\n\nThere are already responses on: ${earlier.map((item) => `passage ${item.passage} ("${item.quote.slice(0, 160)}")`).join("; ")}. Have two or three respondents respond to the same passage, with the same quote.`
  const system =
    language === "nl"
      ? `Je schrijft voor een demonstratie realistische inspraakreacties op het gepubliceerde omgevingsprogramma van de provincie Flevoland.\n\nDe insprekers:\n${people(residents)}\n\nSchrijf 14 reacties in het Nederlands, elk van één inspreker, bij een passage uit het programma. Vier onderwerpen worden door meerdere insprekers genoemd: elk onderwerp door drie of vier insprekers, die allemaal dezelfde passage citeren, elk vanuit hun eigen situatie. Daarnaast twee reacties die op zichzelf staan. Een reactie is twee tot vier zinnen, persoonlijk en concreet, soms kritisch en soms instemmend, zoals echte inspraak. Het citaat (quote) is een letterlijk stuk van één of twee zinnen uit de passage. Verzin geen feiten over de provincie.${earlierNote}\n\nGeef alleen JSON: {"responses":[{"passage":1,"author":"slug","quote":"","body":""}]}. Passages zijn genummerd vanaf 1.`
      : `For a demonstration, you write realistic consultation responses on the published environmental programme of the province of Flevoland.\n\nThe respondents:\n${people(residents)}\n\nWrite 14 responses in English, each from one respondent, on a passage of the programme. Four topics are raised by several respondents: each topic by three or four respondents who all quote the same passage, each from their own situation. Add two responses that stand alone. A response is two to four sentences, personal and specific, sometimes critical and sometimes in agreement, like real consultation. The quote is a literal piece of one or two sentences from the passage. Do not invent facts about the province.${earlierNote}\n\nReturn JSON only: {"responses":[{"passage":1,"author":"slug","quote":"","body":""}]}. Passages are numbered from 1.`
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: JSON.stringify(passages.map((passage, index) => ({ n: index + 1, text: passage.slice(0, 900) }))) },
  ]
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[“”"'‘’]/g, "").replace(/\s+/g, " ").trim()
}

function firstSentences(passage: string, max = 240) {
  const sentences = passage.match(/[^.!?]+[.!?]+/g) || [passage]
  let result = ""
  for (const sentence of sentences) {
    if (result && (result + sentence).length > max) break
    result += sentence
  }
  return result.trim().slice(0, max)
}

/** Keeps responses by known respondents on known passages; a quote not found in its passage becomes the passage's opening. */
export function parseDemoResponses(raw: string, passages: string[], slugs: string[]): DemoResponse[] {
  const parsed = readJson(raw)
  const known = new Set(slugs)
  const result: DemoResponse[] = []
  for (const entry of Array.isArray(parsed?.responses) ? parsed.responses : []) {
    const row = (entry ?? {}) as Record<string, unknown>
    const passage = passages[Number(row.passage) - 1]
    const author = text(row.author)
    const body = text(row.body)
    if (!passage || !known.has(author) || !body) continue
    const quote = text(row.quote)
    result.push({ author, body, quote: quote && normalise(passage).includes(normalise(quote)) ? quote : firstSentences(passage) })
  }
  return result
}
