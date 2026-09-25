import { describe, expect, it } from "vitest"

import { sortAndFilterMeasures } from "@/lib/programme/measure-order"

const measures = [
  { id: "a", priority: "low", decision: "keep", outline_node_id: "n2", created_at: "2026-09-01" },
  { id: "b", priority: "high", decision: null, outline_node_id: "n1", created_at: "2026-09-03" },
  { id: "c", priority: null, decision: "drop", outline_node_id: "n1", created_at: "2026-09-02" },
  { id: "d", priority: "medium", decision: "adapt", outline_node_id: null, created_at: "2026-09-04" },
]
const chapterOrder = ["n1", "n2"]

describe("measure order", () => {
  it("puts high priority first and dropped measures last", () => {
    const ids = sortAndFilterMeasures(measures, { sort: "priority", filter: "all", chapterOrder }).map((m) => m.id)
    expect(ids).toEqual(["b", "d", "a", "c"])
  })

  it("puts measures still to decide first", () => {
    const ids = sortAndFilterMeasures(measures, { sort: "decision", filter: "all", chapterOrder }).map((m) => m.id)
    expect(ids).toEqual(["b", "d", "a", "c"])
  })

  it("orders by chapter, with unplaced measures last", () => {
    const ids = sortAndFilterMeasures(measures, { sort: "chapter", filter: "all", chapterOrder }).map((m) => m.id)
    expect(ids).toEqual(["b", "c", "a", "d"])
  })

  it("filters by staff decision", () => {
    expect(sortAndFilterMeasures(measures, { sort: "newest", filter: "undecided", chapterOrder }).map((m) => m.id)).toEqual(["b"])
    expect(sortAndFilterMeasures(measures, { sort: "newest", filter: "kept", chapterOrder }).map((m) => m.id)).toEqual(["d", "a"])
    expect(sortAndFilterMeasures(measures, { sort: "newest", filter: "dropped", chapterOrder }).map((m) => m.id)).toEqual(["c"])
  })
})
