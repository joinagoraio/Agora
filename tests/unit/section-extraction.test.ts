import { describe, expect, it } from "vitest"
import {
  extractSectionsFromPages,
  looksLikeFalsePositiveHeading,
  resolveSectionForQuote,
} from "@/lib/documents/section-extraction"

describe("extractSectionsFromPages (confidence spike)", () => {
  it("extracts numbered, chapter, markdown, NL titles, and ALL CAPS headings", () => {
    const pages = [
      {
        pageNumber: 1,
        textContent: [
          "Chapter 2 Opgave for the region",
          "2.2 Housing and Mobility",
          "Body text about housing demand and corridors.",
          "PROVINCIAL INTERESTS",
          "Further explanation of interests 14 and 15.",
          "## 5.4 Mobility",
          "Detail on public transport nodes.",
          "Inleiding",
          "Samenvatting",
          "Bijlage A",
        ].join("\n"),
      },
      {
        pageNumber: 2,
        textContent: "3.1 Balanced territory\nNarrative continues without a new heading style.",
      },
    ]

    const sections = extractSectionsFromPages(pages)
    const titles = sections.map((s) => s.title)

    expect(titles.some((t) => /Chapter 2/i.test(t) || /^2\s+Opgave/i.test(t))).toBe(true)
    expect(titles.some((t) => t.includes("2.2"))).toBe(true)
    expect(titles).toContain("PROVINCIAL INTERESTS")
    expect(titles.some((t) => t.includes("5.4 Mobility") || t.includes("Mobility"))).toBe(true)
    expect(titles.some((t) => t.includes("3.1"))).toBe(true)
    expect(titles.some((t) => /inleiding/i.test(t))).toBe(true)
    expect(titles.some((t) => /samenvatting/i.test(t))).toBe(true)
    expect(titles.some((t) => /bijlage/i.test(t))).toBe(true)
    expect(sections.some((s) => s.detection === "nl_title")).toBe(true)
    expect(sections.every((s) => s.pageNumber >= 1)).toBe(true)
  })

  it("skips page markers and long prose false positives", () => {
    expect(looksLikeFalsePositiveHeading("Pagina 12")).toBe(true)
    expect(looksLikeFalsePositiveHeading("Page 3")).toBe(true)
    expect(
      looksLikeFalsePositiveHeading(
        "1. this is a long list item that continues as a full sentence about densification near stations and corridors",
      ),
    ).toBe(true)
    expect(looksLikeFalsePositiveHeading("2.2 Housing")).toBe(false)

    const sections = extractSectionsFromPages([
      {
        pageNumber: 1,
        textContent: [
          "Pagina 12",
          "2.2 Housing",
          "1. this is a long list item that continues as a full sentence about densification near stations and corridors everywhere",
        ].join("\n"),
      },
    ])
    expect(sections.map((s) => s.title).some((t) => /Pagina/i.test(t))).toBe(false)
    expect(sections.some((s) => s.title.includes("2.2"))).toBe(true)
  })

  it("uses font-size heuristic when text items are provided", () => {
    const sections = extractSectionsFromPages([
      {
        pageNumber: 3,
        textContent: "Strong Living Regions Body follows here with normal size text.",
        textItems: [
          { text: "Strong", fontSize: 22, y: 100 },
          { text: "Living", fontSize: 22, y: 100 },
          { text: "Regions", fontSize: 22, y: 100 },
          { text: "Body", fontSize: 11, y: 140 },
          { text: "follows", fontSize: 11, y: 140 },
          { text: "here", fontSize: 11, y: 140 },
          { text: "with", fontSize: 11, y: 140 },
          { text: "normal", fontSize: 11, y: 140 },
          { text: "size", fontSize: 11, y: 140 },
          { text: "text.", fontSize: 11, y: 140 },
        ],
      },
    ])

    expect(sections.some((s) => s.detection === "font_size")).toBe(true)
    expect(sections.some((s) => /Strong Living Regions/i.test(s.title))).toBe(true)
  })

  it("resolves a quote to the nearest preceding section on the page", () => {
    const pageText = [
      "2.2 Housing and Mobility",
      "Intro paragraph.",
      "The corridor requires densification near stations.",
      "5.4 Mobility",
      "Bus frequency should increase.",
    ].join("\n")

    const sections = extractSectionsFromPages([{ pageNumber: 1, textContent: pageText }])
    const quote = "The corridor requires densification near stations."
    const resolved = resolveSectionForQuote(sections, 1, quote, pageText)

    expect(resolved).not.toBeNull()
    expect(resolved?.title).toMatch(/2\.2/)
  })
})
