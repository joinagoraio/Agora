import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { splitTextIntoPages } from "@/lib/documents/text-pages"
import { findNumberedInterests, matchInterestIds, parseWorkupHeadings } from "@/lib/programme/interests"

describe("matchInterestIds", () => {
  const interests = [
    { id: "a", reference: "15", label: "Voldoende, passende en betaalbare woningen voor iedereen" },
    { id: "b", reference: "16", label: "Toekomstbestendige woningen en woonomgevingen in Flevoland" },
    { id: "c", reference: "2", label: "Evenwichtige ontwikkeling van de verschillende leefregio’s in Flevoland" },
  ]

  it("matches by title or by the vision's number", () => {
    expect(matchInterestIds(["Provinciaal belang 15: Voldoende, passende en betaalbare woningen voor iedereen"], interests)).toEqual(["a"])
    expect(matchInterestIds(["belang 16"], interests)).toEqual(["b"])
    expect(matchInterestIds(["2 Evenwichtige ontwikkeling van de verschillende leefregio's in Flevoland"], interests)).toEqual(["c"])
    expect(matchInterestIds(["wonen", "nothing here"], interests)).toEqual([])
  })
})

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
