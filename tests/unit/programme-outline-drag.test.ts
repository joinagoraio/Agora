import { outlineDragInsertIndex } from "@/lib/programme/outline-drag"

describe("outline drag insert index", () => {
  it("places the item before the first row whose center is below the pointer", () => {
    expect(outlineDragInsertIndex([40, 120, 200], 10)).toBe(0)
    expect(outlineDragInsertIndex([40, 120, 200], 80)).toBe(1)
    expect(outlineDragInsertIndex([40, 120, 200], 160)).toBe(2)
    expect(outlineDragInsertIndex([40, 120, 200], 240)).toBe(3)
  })

  it("appends when there are no remaining rows", () => {
    expect(outlineDragInsertIndex([], 100)).toBe(0)
  })
})
