import { byPriority, parseMeasurePriority } from "@/lib/programme/measure-priority"
import { parseRoleCheck } from "@/lib/programme/role-check"

export type MeasureBlockSource = {
  title: string
  specific_action?: string | null
  owner_role?: string | null
  geography?: string | null
  timeline?: string | null
  indicator?: string | null
  contributes_to_vision?: string[] | null
  provincial_interests?: string[] | null
  challenge?: string | null
  resources?: string | null
  role_check?: unknown
  priority?: unknown
  priority_reason?: string | null
}

const PRIORITY_WORDS = {
  Dutch: { high: "hoog", medium: "middel", low: "laag" },
  English: { high: "high", medium: "medium", low: "low" },
} as const

const ACTORS = {
  Dutch: { authority: "deze overheid", other_government: "andere overheid", other_party: "andere partij", shared: "gedeeld" },
  English: { authority: "this authority", other_government: "other government", other_party: "other party", shared: "shared" },
} as const

const LABELS = {
  Dutch: {
    goal: "Doel",
    interest: "Belang",
    challenge: "Opgave",
    role: "Rol",
    action: "Maatregel",
    area: "Gebied",
    time: "Termijn",
    indicator: "Indicator",
    resources: "Middelen",
    actor: "Wie handelt",
    priority: "Prioriteit (door medewerkers)",
  },
  English: {
    goal: "Goal",
    interest: "Interest",
    challenge: "Challenge",
    role: "Role",
    action: "Measure",
    area: "Area",
    time: "Timing",
    indicator: "Indicator",
    resources: "Resources",
    actor: "Who acts",
    priority: "Priority (set by staff)",
  },
} as const

/** One measure as labelled lines for a drafting prompt, in the authority's writing language. */
export function formatMeasureBlock(measure: MeasureBlockSource, language: "Dutch" | "English"): string {
  const label = LABELS[language]
  const lines = [`- ${measure.title}`]
  const add = (key: keyof typeof label, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(`  ${label[key]}: ${value.trim()}`)
  }
  const priority = parseMeasurePriority(measure.priority)
  if (priority) {
    const reason = measure.priority_reason?.trim()
    add("priority", `${PRIORITY_WORDS[language][priority]}${reason ? ` — ${reason}` : ""}`)
  }
  add("goal", measure.contributes_to_vision?.join("; "))
  add("interest", measure.provincial_interests?.join("; "))
  add("challenge", measure.challenge)
  add("role", measure.owner_role)
  const roleCheck = parseRoleCheck(measure.role_check)
  if (roleCheck) add("actor", `${ACTORS[language][roleCheck.actor]} — ${roleCheck.reason}`)
  add("action", measure.specific_action)
  add("area", measure.geography)
  add("time", measure.timeline)
  add("indicator", measure.indicator)
  add("resources", measure.resources)
  return lines.join("\n")
}

/** Every measure, grouped under the chapter it is placed in. */
export function formatMeasureList(
  measures: Array<MeasureBlockSource & { outline_node_id?: string | null }>,
  chapters: Array<{ id: string; title: string }>,
  language: "Dutch" | "English",
): string {
  const unplacedTitle = language === "Dutch" ? "Niet in een hoofdstuk" : "Not in a chapter"
  const groups = new Map<string, string[]>()
  const titleFor = (id: string | null | undefined) => chapters.find((chapter) => chapter.id === id)?.title ?? unplacedTitle
  for (const measure of byPriority(measures)) {
    const title = titleFor(measure.outline_node_id)
    const list = groups.get(title) || []
    list.push(formatMeasureBlock(measure, language))
    groups.set(title, list)
  }
  return [...groups.entries()].map(([title, blocks]) => `${title}:\n${blocks.join("\n")}`).join("\n\n")
}
