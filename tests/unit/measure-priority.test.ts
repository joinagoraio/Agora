import { describe, expect, it } from "vitest"

import { formatMeasureBlock, formatMeasureList } from "@/lib/programme/measure-block"
import { byPriority, parseMeasurePriority } from "@/lib/programme/measure-priority"

describe("measure priority", () => {
  it("orders high, medium, low, then unset, keeping the original order within each", () => {
    const ordered = byPriority([
      { id: "a" },
      { id: "b", priority: "low" },
      { id: "c", priority: "high" },
      { id: "d", priority: "medium" },
      { id: "e", priority: "high" },
      { id: "f", priority: "urgent" },
    ])
    expect(ordered.map((m) => m.id)).toEqual(["c", "e", "d", "b", "a", "f"])
  })

  it("reads only known priorities", () => {
    expect(parseMeasurePriority("high")).toBe("high")
    expect(parseMeasurePriority("urgent")).toBeNull()
    expect(parseMeasurePriority(null)).toBeNull()
  })

  it("adds the staff priority to the measure block and sorts the chapter list by it", () => {
    expect(formatMeasureBlock({ title: "Toets", priority: "high", priority_reason: "Netcongestie" }, "Dutch")).toContain(
      "Prioriteit (door medewerkers): hoog — Netcongestie",
    )
    const list = formatMeasureList(
      [
        { title: "Later", priority: "low", outline_node_id: "n1" },
        { title: "Eerst", priority: "high", outline_node_id: "n1" },
      ],
      [{ id: "n1", title: "Maatregelen" }],
      "Dutch",
    )
    expect(list.indexOf("Eerst")).toBeLessThan(list.indexOf("Later"))
  })
})
