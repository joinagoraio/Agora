import { describe, expect, it } from "vitest"
import {
  findNearDuplicateMeasureGroups,
  overlapFindingsFromMeasures,
} from "@/lib/programme/measure-duplicates"

describe("measure near-duplicates", () => {
  it("groups exact titles and paraphrased housing measures", () => {
    const groups = findNearDuplicateMeasureGroups([
      {
        id: "a",
        title: "Station housing pilots",
        specificAction: "Fund two station-area housing pilots near nodes",
        outlineNodeId: "n1",
      },
      {
        id: "b",
        title: "Housing pilots at stations",
        specificAction: "Fund station-area housing pilots near mobility nodes",
        outlineNodeId: "n2",
      },
      { id: "c", title: "Quiet landscape buffers", specificAction: "Keep large-scale sprawl out of quiet landscapes" },
    ])
    expect(groups.length).toBeGreaterThanOrEqual(1)
    const pair = groups.find((group) => group.members.some((item) => item.id === "a"))
    expect(pair?.members.map((item) => item.id).sort()).toEqual(["a", "b"])
    expect(pair?.reason).toBe("cross_chapter")
  })

  it("turns overlap groups into QC findings", () => {
    const findings = overlapFindingsFromMeasures([
      { id: "a", title: "Same title", specificAction: "Do the same specific action here" },
      { id: "b", title: "Same title", specificAction: "Do the same specific action here" },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.summary).toContain("Same title")
  })
})
