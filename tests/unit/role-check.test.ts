import { describe, expect, it } from "vitest"

import { formatCoherenceInputs, formatInterestInputs, withInterestLabels } from "@/lib/programme/chapter-inputs"
import type { CoherenceFinding } from "@/lib/programme/coherence"
import type { ProgrammeInterest } from "@/lib/programme/interests"
import { formatMeasureBlock } from "@/lib/programme/measure-block"
import { parseRoleCheck, roleCheckSchema } from "@/lib/programme/role-check"

const interest = (id: string, reference: string, label: string, selected = true): ProgrammeInterest => ({
  id,
  workspaceId: "w",
  reference,
  label,
  summary: null,
  citations: [],
  selected,
  sortOrder: Number(reference),
  origin: "extracted",
  workupDocumentId: `doc-${id}`,
})

describe("role check", () => {
  it("reads common words for who acts", () => {
    expect(roleCheckSchema.parse({ actor: "Provincie", reason: "Eigen bevoegdheid" }).actor).toBe("authority")
    expect(roleCheckSchema.parse({ actor: "other level", reason: "Rijk beslist" }).actor).toBe("other_government")
    expect(roleCheckSchema.parse({ actor: "gedeeld", reason: "Samen met gemeenten" }).actor).toBe("shared")
  })

  it("rejects an unknown actor and reads page numbers given as text", () => {
    expect(roleCheckSchema.safeParse({ actor: "nobody", reason: "unclear" }).success).toBe(false)
    expect(parseRoleCheck({ actor: "authority", reason: "Verordening", pageNumber: "44" })?.pageNumber).toBe(44)
  })

  it("adds who acts to the measure block", () => {
    const block = formatMeasureBlock(
      { title: "Toets", role_check: { actor: "shared", reason: "Gemeenten stellen plannen vast." } },
      "Dutch",
    )
    expect(block).toContain("Wie handelt: gedeeld — Gemeenten stellen plannen vast.")
  })
})

describe("chapter inputs", () => {
  const interests = [interest("a", "14", "Vitale steden"), interest("b", "15", "Betaalbare woningen"), interest("c", "3", "Landschap", false)]

  it("names linked interests on measures", () => {
    const [measure] = withInterestLabels([{ interest_ids: ["a", "b"], provincial_interests: [] }], interests)
    expect(measure.provincial_interests).toEqual(["14 Vitale steden", "15 Betaalbare woningen"])
  })

  it("lists only chosen interests with their work-up text", () => {
    const text = formatInterestInputs(interests, new Map([["a", "<h2>Onderbouwing</h2><p>Sterke kernen.</p>"]]), "Dutch")
    expect(text).toContain("### 14 Vitale steden\nOnderbouwing\n Sterke kernen.")
    expect(text).toContain("### 15 Betaalbare woningen\n(nog niet uitgewerkt)")
    expect(text).not.toContain("Landschap")
  })

  it("passes only links staff kept", () => {
    const finding = (id: string, decision: CoherenceFinding["decision"]): CoherenceFinding => ({
      id,
      kind: "dilemma",
      title: `Link ${id}`,
      explanation: "Netcapaciteit remt woningbouw.",
      interestIds: ["a", "b"],
      measureIds: ["m1"],
      citations: [{ documentId: "d1", pageNumber: 13, quote: "binnen de beschikbare capaciteit" }],
      origin: "model",
      decision,
      decisionReason: null,
      decidedAt: null,
    })
    const text = formatCoherenceInputs(
      [finding("1", "keep"), finding("2", null), finding("3", "drop")],
      interests,
      new Map([["m1", "Netbewuste toets"]]),
      "Dutch",
    )
    expect(text).toContain("[Dilemma] Link 1")
    expect(text).toContain("Maatregelen: Netbewuste toets")
    expect(text).toContain('"binnen de beschikbare capaciteit" (documentId d1, p. 13)')
    expect(text).not.toContain("Link 2")
    expect(text).not.toContain("Link 3")
  })
})
