import { describe, expect, it } from "vitest"
import { resolveMeasureVisionAnchors, splitAnchorList, titlesOverlap } from "@/lib/programme/vision-path"

describe("vision path anchors", () => {
  it("splits comma and newline lists", () => {
    expect(splitAnchorList("Housing near nodes, Quiet landscapes\nWater safety")).toEqual([
      "Housing near nodes",
      "Quiet landscapes",
      "Water safety",
    ])
  })

  it("uses explicit vision and interest fields as the path", () => {
    const anchors = resolveMeasureVisionAnchors({
      title: "Station-area housing pilots",
      contributesToVision: ["Housing near nodes"],
      provincialInterests: ["14"],
    })
    expect(anchors).toEqual([
      { label: "Housing near nodes", nodeType: "ambition" },
      { label: "14", nodeType: "provincial_interest" },
    ])
  })

  it("adds matching coverage findings when the measure title overlaps", () => {
    const anchors = resolveMeasureVisionAnchors({
      title: "Station-area housing pilots",
      contributesToVision: [],
      findings: [
        {
          summary: "Housing pilots near station areas lack a vision path",
          visionAnchor: "Housing near nodes",
        },
        { summary: "Unrelated water safety gap" },
      ],
    })
    expect(anchors.map((a) => a.label)).toContain("Housing near nodes")
    expect(anchors.map((a) => a.label)).not.toContain("Unrelated water safety gap")
  })

  it("requires two shared tokens before treating titles as related", () => {
    expect(titlesOverlap("Station-area housing pilots", "Housing Development Ambitions")).toBe(false)
    expect(titlesOverlap("Station-area housing pilots", "station area housing programme")).toBe(true)
  })
})
