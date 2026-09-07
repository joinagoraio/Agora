import {
  collectionDragInsertIndex,
  dashboardPinKey,
  insertItemAt,
  insertKeyedItemAt,
} from "@/lib/dashboard/pin-order"

describe("dashboard pin order", () => {
  it("builds a stable pin key", () => {
    expect(dashboardPinKey("programme", "ws-1")).toBe("programme:ws-1")
  })

  it("inserts among remaining list rows from pointer Y", () => {
    const rows = [
      { cx: 40, cy: 40, height: 40 },
      { cx: 40, cy: 120, height: 40 },
      { cx: 40, cy: 200, height: 40 },
    ]
    expect(collectionDragInsertIndex(rows, { x: 10, y: 10 }, "list")).toBe(0)
    expect(collectionDragInsertIndex(rows, { x: 10, y: 80 }, "list")).toBe(1)
    expect(collectionDragInsertIndex(rows, { x: 10, y: 240 }, "list")).toBe(3)
  })

  it("inserts among a wrapping grid from reading order", () => {
    const cards = [
      { cx: 40, cy: 40, height: 60 },
      { cx: 140, cy: 40, height: 60 },
      { cx: 40, cy: 140, height: 60 },
      { cx: 140, cy: 140, height: 60 },
    ]
    expect(collectionDragInsertIndex(cards, { x: 20, y: 40 }, "grid")).toBe(0)
    expect(collectionDragInsertIndex(cards, { x: 120, y: 40 }, "grid")).toBe(1)
    expect(collectionDragInsertIndex(cards, { x: 20, y: 140 }, "grid")).toBe(2)
    expect(collectionDragInsertIndex(cards, { x: 200, y: 200 }, "grid")).toBe(4)
  })

  it("moves an item to an insert index among the remaining items", () => {
    expect(insertItemAt(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
    expect(insertItemAt(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"])
    expect(insertKeyedItemAt(["a", "b", "c"], (item) => item, "b", 0)).toEqual(["b", "a", "c"])
    expect(insertItemAt(["a", "b"], 3, 0)).toEqual(["a", "b"])
  })
})
