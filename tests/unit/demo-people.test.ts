import { describe, expect, it } from "vitest"

import { colleagueNotesMessages, parseDemoNotes, parseDemoResponses, publishedPassages, residentResponsesMessages } from "@/lib/demo/people-prompts"
import { meaningGroupsMessages, parseMeaningGroups } from "@/lib/programme/meaning-groups"
import { buildPublicTopicSummaryDraft } from "@/lib/programme/consultation-cluster"

describe("demo colleague notes", () => {
  it("keeps notes on known paragraphs by known colleagues, and replies to other colleagues' notes", () => {
    const raw = JSON.stringify({
      notes: [
        { paragraph: 1, author: "anne-bakker", body: "Welke gemeenten doen mee?" },
        { paragraph: 9, author: "anne-bakker", body: "Buiten bereik" },
        { paragraph: 2, author: "someone-else", body: "Onbekend" },
        { paragraph: 2, author: "joris-van-dam", body: "  Is hier een  wettelijke grondslag voor?  " },
      ],
      replies: [
        { to: 1, author: "joris-van-dam", body: "Eens." },
        { to: 1, author: "anne-bakker", body: "Een reactie op zichzelf" },
        { to: 5, author: "joris-van-dam", body: "Geen notitie" },
      ],
    })
    const plan = parseDemoNotes(`Hier is het: ${raw}`, 3, ["anne-bakker", "joris-van-dam"])
    expect(plan.notes).toEqual([
      { paragraph: 0, author: "anne-bakker", body: "Welke gemeenten doen mee?" },
      { paragraph: 1, author: "joris-van-dam", body: "Is hier een wettelijke grondslag voor?" },
    ])
    expect(plan.replies).toEqual([{ to: 0, author: "joris-van-dam", body: "Eens." }])
  })

  it("writes the prompt in the programme's language, with every colleague and numbered paragraphs", () => {
    const messages = colleagueNotesMessages("nl", [{ slug: "anne-bakker", name: "Anne Bakker", role: "beleidsadviseur wonen" }], [
      { documentId: "d", blockId: "b", chapter: "Ambities", text: "De provincie wil meer betaalbare woningen." },
    ])
    expect(messages[0]?.content).toContain("anne-bakker: Anne Bakker, beleidsadviseur wonen")
    expect(messages[0]?.content).toContain("in het Nederlands")
    expect(JSON.parse(messages[1]!.content)).toEqual([{ n: 1, chapter: "Ambities", text: "De provincie wil meer betaalbare woningen." }])
  })
})

describe("demo consultation responses", () => {
  const markdown = [
    "# Programma Wonen",
    "",
    "De provincie Flevoland wil tot 2030 zorgen voor voldoende betaalbare woningen in alle kernen. Daarvoor maakt zij afspraken met gemeenten en corporaties.",
    "",
    "Kort.",
    "",
    "- De provincie ondersteunt [gemeenten](https://example.com) bij **binnenstedelijk bouwen**, zodat de open ruimte tussen de kernen behouden blijft.[^1]",
    "",
    "| tabel | rij |",
  ].join("\n")

  it("reads the readable passages of a published programme without headings, tables or markup", () => {
    expect(publishedPassages(markdown)).toEqual([
      "De provincie Flevoland wil tot 2030 zorgen voor voldoende betaalbare woningen in alle kernen. Daarvoor maakt zij afspraken met gemeenten en corporaties.",
      "De provincie ondersteunt gemeenten bij binnenstedelijk bouwen, zodat de open ruimte tussen de kernen behouden blijft.",
    ])
  })

  it("keeps a quote found in its passage and otherwise quotes the passage's opening", () => {
    const passages = publishedPassages(markdown)
    const raw = JSON.stringify({
      responses: [
        { passage: 1, author: "marieke-jansen", quote: "voldoende betaalbare woningen in alle kernen", body: "Ook in Urk?" },
        { passage: 2, author: "ruud-de-boer", quote: "Een zin die er niet staat.", body: "Goed plan." },
        { passage: 3, author: "ruud-de-boer", quote: "", body: "Geen passage" },
        { passage: 1, author: "onbekend", quote: "", body: "Onbekende inspreker" },
      ],
    })
    expect(parseDemoResponses(raw, passages, ["marieke-jansen", "ruud-de-boer"])).toEqual([
      { author: "marieke-jansen", body: "Ook in Urk?", quote: "voldoende betaalbare woningen in alle kernen" },
      { author: "ruud-de-boer", body: "Goed plan.", quote: "De provincie ondersteunt gemeenten bij binnenstedelijk bouwen, zodat de open ruimte tussen de kernen behouden blijft." },
    ])
  })

  it("asks for responses on the same passage as the ones already in", () => {
    const passages = publishedPassages(markdown)
    const messages = residentResponsesMessages("nl", [{ slug: "marieke-jansen", name: "Marieke Jansen (Almere)", role: "inwoner" }], passages, [
      "voldoende betaalbare woningen",
    ])
    expect(messages[0]?.content).toContain('passage 1 ("voldoende betaalbare woningen")')
  })
})

describe("grouping by meaning", () => {
  it("maps numbered items to ids, uses each item once and drops small or unlabelled groups", () => {
    const raw = JSON.stringify({
      groups: [
        { items: [1, 3], label: "Wie betaalt", summary: "Twee vragen over geld.", reply: "Dat staat in hoofdstuk 7." },
        { items: [3, 4], label: "Dubbel", summary: "", reply: "" },
        { items: [2], label: "Alleen", summary: "", reply: "" },
        { items: [5, 6], label: "", summary: "", reply: "" },
      ],
    })
    expect(parseMeaningGroups(raw, ["a", "b", "c", "d", "e", "f"])).toEqual([
      { memberIds: ["a", "c"], label: "Wie betaalt", summary: "Twee vragen over geld.", reply: "Dat staat in hoofdstuk 7.", status: null },
    ])
    expect(parseMeaningGroups(raw, ["a", "b", "c", "d"], { minSize: 1 }).map((group) => group.memberIds)).toEqual([["a", "c"], ["d"], ["b"]])
    expect(parseMeaningGroups("no json", ["a"])).toEqual([])
  })

  it("asks for a proposed decision only for consultation responses", () => {
    expect(meaningGroupsMessages("responses", "nl", [{ id: "a", body: "x" }])[0]?.content).toContain('"status"')
    expect(meaningGroupsMessages("notes", "nl", [{ id: "a", body: "x" }])[0]?.content).not.toContain('"status"')
  })
})

describe("public topic summary", () => {
  it("is written in Dutch for a Dutch authority, with the decision and the province's reasoning", () => {
    const markdown = buildPublicTopicSummaryDraft({
      language: "nl",
      commentCount: 5,
      clusters: [
        {
          label: "Betaalbaarheid voor starters",
          memberCount: 3,
          summary: "Starters vragen hoe de woningen betaalbaar blijven.",
          ownerSummary: "We voegen een maatregel toe voor betaalbare koop.",
          appliedStatus: "accepted_with_modification",
        },
      ],
    })
    expect(markdown).toContain("# Wat we met de reacties hebben gedaan")
    expect(markdown).toContain("5 reacties ontvangen, over 1 onderwerp.")
    expect(markdown).toContain("3 reacties. Besluit: overgenomen met een aanpassing.")
    expect(markdown).toContain("Starters vragen hoe de woningen betaalbaar blijven.")
    expect(markdown).toContain("Toelichting van de provincie: We voegen een maatregel toe voor betaalbare koop.")
  })
})
