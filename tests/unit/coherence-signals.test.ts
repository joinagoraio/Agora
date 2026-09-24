import { describe, expect, it } from "vitest"

import { coherenceSignals } from "@/lib/programme/coherence"

const interests = [
  { id: "a", reference: "14", label: "Vitale steden" },
  { id: "b", reference: "15", label: "Betaalbare woningen" },
  { id: "c", reference: "16", label: "Toekomstbestendige woningen" },
]

describe("coherence signals", () => {
  it("groups measures by the set of interests they serve", () => {
    const signals = coherenceSignals(
      [
        { id: "m1", title: "Regionale afspraken", interest_ids: ["a", "b"] },
        { id: "m2", title: "Planmonitor", interest_ids: ["b", "a"] },
        { id: "m3", title: "Netbewuste toets", interest_ids: ["b", "c"] },
        { id: "m4", title: "Alleen voor 14", interest_ids: ["a"] },
        { id: "m5", title: "Weggestreept", interest_ids: ["a", "b"], decision: "drop" },
      ],
      interests,
      "Dutch",
    )
    const serving = signals.filter((signal) => signal.title.includes("dien"))
    expect(serving.map((signal) => signal.title)).toEqual(["2 maatregelen dienen 14 en 15", "1 maatregel dient 15 en 16"])
    expect(serving[0]!.measureIds).toEqual(["m1", "m2"])
  })

  it("puts near-identical measures under different interests into one cluster", () => {
    const signals = coherenceSignals(
      [
        { id: "m1", title: "Regionale afspraken over betaalbaarheid en aandachtsgroepen", interest_ids: ["a"] },
        { id: "m2", title: "Regionale afspraken over betaalbaarheid en aandachtsgroepen vastleggen", interest_ids: ["b"] },
        { id: "m3", title: "Regionale afspraken over betaalbaarheid en aandachtsgroepen maken", interest_ids: ["c"] },
        { id: "m4", title: "Iets heel anders over landschap", interest_ids: ["c"] },
      ],
      interests,
      "Dutch",
    )
    const clusters = signals.filter((signal) => signal.title.startsWith("Mogelijk"))
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.measureIds.sort()).toEqual(["m1", "m2", "m3"])
    expect(clusters[0]!.interestIds).toEqual(["a", "b", "c"])
  })
})
