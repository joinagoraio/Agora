import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { splitTextIntoPages } from "@/lib/documents/text-pages"
import { findNumberedInterests, parseWorkupHeadings } from "@/lib/programme/interests"

describe("findNumberedInterests", () => {
  const text = readFileSync(resolve(process.cwd(), "lib/programme/flevoland-sources/vision-2050.txt"), "utf8")
  const interests = findNumberedInterests(splitTextIntoPages(text), "vision")

  it("finds every numbered interest in the vision with its page", () => {
    expect(interests.map((interest) => interest.reference)).toEqual(Array.from({ length: 37 }, (_, index) => String(index + 1)))
    expect(interests.every((interest) => (interest.citation.pageNumber ?? 0) > 1)).toBe(true)
  })

  it("joins titles that wrap and stops at the next heading", () => {
    const byRef = new Map(interests.map((interest) => [interest.reference, interest]))
    expect(byRef.get("2")?.label).toBe("Evenwichtige ontwikkeling van de verschillende leefregio’s in Flevoland")
    expect(byRef.get("3")?.label).toBe("Gezonde klimaat bestendige leefomgeving en toegankelijk en beleefbaar buitengebied")
    expect(byRef.get("37")?.label).toBe("Een leefbaar en aantrekkelijk landelijk gebied")
    expect(byRef.get("2")?.summary).toMatch(/provincie kijkt vanuit bovenlokaal/)
  })

  it("ignores contents lines without a colon", () => {
    const pages = [{ pageNumber: 1, text: "Provinciaal belang \t15\nProvinciaal belang 4: Innovatieve economie" }]
    expect(findNumberedInterests(pages, "d").map((interest) => interest.reference)).toEqual(["4"])
  })
})

describe("parseWorkupHeadings", () => {
  it("keeps labels, fills keys, and drops empty rows", () => {
    expect(parseWorkupHeadings([{ label: "Onderbouwing" }, { key: "x", label: " " }, { key: "m", label: "Monitoring", instruction: "Kort" }])).toEqual([
      { key: "h1", label: "Onderbouwing" },
      { key: "m", label: "Monitoring", instruction: "Kort" },
    ])
  })
})
