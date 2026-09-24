import { z } from "zod"

export const ROLE_ACTORS = ["authority", "other_government", "other_party", "shared"] as const
export type RoleActor = (typeof ROLE_ACTORS)[number]

export const roleCheckSchema = z.object({
  actor: z.enum(ROLE_ACTORS),
  reason: z.string().min(3),
  quote: z.string().optional(),
  documentId: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
})

export type RoleCheckInput = z.infer<typeof roleCheckSchema>

export type RoleCheck = RoleCheckInput & { checkedAt: string }

export function parseRoleCheck(raw: unknown): RoleCheck | null {
  if (!raw || typeof raw !== "object") return null
  const parsed = roleCheckSchema.safeParse(raw)
  if (!parsed.success) return null
  const checkedAt = (raw as { checkedAt?: unknown }).checkedAt
  return { ...parsed.data, checkedAt: typeof checkedAt === "string" ? checkedAt : "" }
}

export function stampRoleCheck(input: RoleCheckInput): RoleCheck {
  return { ...input, checkedAt: new Date().toISOString() }
}

const AUTHORITY_KIND: Record<string, string> = {
  national: "a national government",
  regional: "a regional government (a province)",
  municipal: "a municipality",
}

/** The instruction that asks the model who has to act on a measure. */
export function roleCheckInstruction(spaceType: string | null | undefined): string {
  const kind = AUTHORITY_KIND[spaceType || ""] || "a public authority"
  return [
    `The programme is written by ${kind}. For each measure, say who has to act, going by the sources:`,
    `"authority" when this authority can do it with its own powers or money; "other_government" when another level of government has to act (state, water board, municipality); "other_party" when a non-government party has to act (housing associations, grid operators, companies); "shared" when it depends on several of these together.`,
    `Give one sentence of reason, and a quote with its documentId and pageNumber when a source says so. Never guess a legal power the sources do not mention; say the sources are silent instead.`,
  ].join(" ")
}
