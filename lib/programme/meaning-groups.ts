/**
 * Groups short texts that make the same point, such as colleague notes or consultation responses,
 * by asking the AI. Word overlap misses notes that say the same thing in other words.
 */

export type MeaningGroupKind = "notes" | "responses"

export type MeaningGroup = {
  memberIds: string[]
  label: string
  summary: string
  reply: string
  status: string | null
}

export type MeaningItem = { id: string; body: string; quote?: string }

const INSTRUCTIONS: Record<MeaningGroupKind, Record<"nl" | "en", string>> = {
  notes: {
    nl: "Je groepeert notities van collega's op een concept-omgevingsprogramma. Zet notities die hetzelfde punt maken in één groep, ook als ze het anders verwoorden of bij een andere alinea staan. Een notitie die op zichzelf staat, laat je weg. Geef per groep een korte kop (label), een samenvatting van één of twee zinnen (summary) en een conceptantwoord dat de schrijver één keer aan alle collega's in de groep kan geven (reply), in de ik-vorm van de schrijver.",
    en: "You group colleague notes on a draft environmental programme. Put notes that make the same point in one group, even when they word it differently or sit on another paragraph. Leave out a note that stands alone. For each group give a short heading (label), a summary of one or two sentences (summary), and a draft answer the writer can give once to every colleague in the group (reply), in the writer's own voice.",
  },
  responses: {
    nl: "Je groepeert reacties van inwoners en partners op een gepubliceerd omgevingsprogramma, op onderwerp. Elke reactie komt in precies één onderwerp. Maak liever minder, bredere onderwerpen, meestal drie tot zes: reacties op dezelfde passage of over dezelfde zorg horen bij elkaar, ook als ze het anders zeggen. Alleen een reactie die echt nergens bij past, krijgt een eigen onderwerp. Geef per onderwerp een korte kop (label), een samenvatting (summary), een voorstel voor het antwoord van de provincie (reply) en een voorgesteld besluit (status): accepted, accepted_with_modification, rejected, merged of out_of_scope. Kies in_discussion alleen als er echt meer uitzoekwerk nodig is. Het antwoord is twee of drie zinnen en blijft bij wat het programma al zegt of kan aanpassen; beloof geen nieuwe regelingen, geld of datums. Je stelt voor; de ambtenaar beslist.",
    en: "You group responses from residents and partners on a published environmental programme, by topic. Each response goes into exactly one topic. Prefer fewer, broader topics, usually three to six: responses on the same passage or about the same concern belong together, even when they say it differently. Only a response that really fits nowhere gets a topic of its own. For each topic give a short heading (label), a summary (summary), a proposed answer from the province (reply) and a proposed decision (status): accepted, accepted_with_modification, rejected, merged or out_of_scope. Choose in_discussion only when more research is really needed. The answer is two or three sentences and stays with what the programme already says or can change; do not promise new schemes, money or dates. You propose; the civil servant decides.",
  },
}

export function meaningGroupsMessages(kind: MeaningGroupKind, language: "nl" | "en", items: MeaningItem[]) {
  return [
    {
      role: "system" as const,
      content: `${INSTRUCTIONS[kind][language]}\n\nReturn JSON only: {"groups":[{"items":[1,2],"label":"","summary":"","reply":""${kind === "responses" ? ',"status":""' : ""}}]}. Items are numbered from 1.`,
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        items.map((item, index) => ({ n: index + 1, ...(item.quote ? { quote: item.quote.slice(0, 400) } : {}), text: item.body.slice(0, 1200) })),
      ),
    },
  ]
}

/**
 * Joins groups whose items share a key, such as responses quoting the same passage, keeping the first group's
 * text. The AI sometimes splits what plainly belongs together.
 */
export function joinGroupsSharing(groups: MeaningGroup[], keyOf: (id: string) => string | null): MeaningGroup[] {
  const result: MeaningGroup[] = []
  const byKey = new Map<string, MeaningGroup>()
  for (const group of groups) {
    const keys = [...new Set(group.memberIds.map(keyOf).filter((key): key is string => Boolean(key)))]
    const target = keys.map((key) => byKey.get(key)).find(Boolean)
    if (target) {
      target.memberIds.push(...group.memberIds.filter((id) => !target.memberIds.includes(id)))
    } else {
      const copy = { ...group, memberIds: [...group.memberIds] }
      result.push(copy)
    }
    const owner = target ?? result[result.length - 1]!
    for (const key of keys) if (!byKey.has(key)) byKey.set(key, owner)
  }
  return result
}

/** Reads the AI's groups. Each item lands in one group at most; unknown numbers and groups below `minSize` are dropped. */
export function parseMeaningGroups(raw: string, ids: string[], { minSize = 2 }: { minSize?: number } = {}): MeaningGroup[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return []
  }
  const groups = (parsed as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return []
  const used = new Set<string>()
  const result: MeaningGroup[] = []
  for (const entry of groups) {
    const row = (entry ?? {}) as Record<string, unknown>
    const numbers = Array.isArray(row.items) ? row.items : []
    const memberIds: string[] = []
    for (const value of numbers) {
      const id = ids[Number(value) - 1]
      if (!id || used.has(id)) continue
      used.add(id)
      memberIds.push(id)
    }
    const label = typeof row.label === "string" ? row.label.trim() : ""
    if (memberIds.length < minSize || !label) continue
    result.push({
      memberIds,
      label,
      summary: typeof row.summary === "string" ? row.summary.trim() : "",
      reply: typeof row.reply === "string" ? row.reply.trim() : "",
      status: typeof row.status === "string" ? row.status.trim() : null,
    })
  }
  return result
}
