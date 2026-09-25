import type { FeedbackEntry } from "@/lib/demo/feedback"

const HEADINGS = {
  nl: ["Onderwerpen", "Waar de antwoorden tekortschoten", "Wat onduidelijk leek of ontbrak", "Verbeterpunten", "Vervolgvragen voor het team"],
  en: ["Topics", "Where the answers fell short", "What seemed unclear or missing", "Improvement points", "Follow-up questions for the team"],
} as const

const MAX_ENTRIES = 80
const MAX_ANSWER_CHARS = 900

/** The instructions and log for the end-of-demo summary. */
export function digestPrompt(entries: FeedbackEntry[], language: "nl" | "en") {
  const headings = HEADINGS[language]
  const system = [
    "You summarise what civil servants asked Agora during a live demonstration, so the team can improve the product.",
    `Write in ${language === "nl" ? "Dutch" : "English"}, in Markdown, with exactly these headings, in this order: ${headings.map((heading) => `## ${heading}`).join(", ")}.`,
    `Under "${headings[3]}", give concrete, numbered suggestions for the product.`,
    "The summary is shown to the room: never name people, and do not quote a question literally; describe it in your own words.",
    "Use only what is in the log. Keep it brief. If a heading has nothing, say so in one line.",
  ].join("\n")
  const user = entries
    .slice(-MAX_ENTRIES)
    .map((entry, index) => {
      const via = entry.source === "questions" ? "spoken, Questions button" : "typed or dictated in Ask"
      const where = entry.stepId ? `, during tour step "${entry.stepId}"` : ""
      const answer = entry.answer ? entry.answer.slice(0, MAX_ANSWER_CHARS) : "(no answer recorded)"
      return `${index + 1}. (${via}${where})\nQuestion: ${entry.question}\nAnswer: ${answer}`
    })
    .join("\n\n")
  return { system, user: `Conversation log:\n\n${user}`, headings }
}
