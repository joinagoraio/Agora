import { describe, expect, it } from "vitest"
import { parseSectionOpen, serializeSectionOpen } from "@/lib/ui/section-open"

describe("section open preference", () => {
  it("stores open and closed as explicit values", () => {
    expect(serializeSectionOpen(true)).toBe("open")
    expect(serializeSectionOpen(false)).toBe("closed")
  })

  it("reads only known values", () => {
    expect(parseSectionOpen("open")).toBe(true)
    expect(parseSectionOpen("closed")).toBe(false)
    expect(parseSectionOpen("1")).toBeNull()
    expect(parseSectionOpen(null)).toBeNull()
  })
})
