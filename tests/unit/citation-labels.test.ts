import { describe, expect, it } from "vitest"
import { citedDocumentIdsFromUnknown, formatCitationLabel } from "@/lib/programme/citation-labels"
import { buildUnusedSourceReport, unusedDocumentIdsFromReport } from "@/lib/programme/unused-sources"

describe("citation labels", () => {
  it("formats document title, section, and page", () => {
    expect(
      formatCitationLabel(
        { documentId: "v1", sectionId: "s1", pageNumber: 12 },
        [{ id: "v1", title: "Omgevingsvisie Flevoland 2050" }],
        [{ id: "s1", documentId: "v1", title: "4.2 Sterke Leefregio's", pageNumber: 12 }],
      ),
    ).toBe("Omgevingsvisie Flevoland 2050, § 4.2 Sterke Leefregio's, p.12")
  })

  it("falls back to the document id", () => {
    expect(formatCitationLabel({ documentId: "missing" })).toBe("missing")
  })

  it("reads a filename title as a name", () => {
    expect(
      formatCitationLabel(
        { documentId: "p1" },
        [{ id: "p1", title: "02-woonprogramma-2024-stationspilots.md" }],
      ),
    ).toBe("02 woonprogramma 2024 stationspilots")
  })

  it("collects cited document ids from nested findings", () => {
    expect(
      citedDocumentIdsFromUnknown([
        { citations: [{ documentId: "a" }, { documentId: "b" }] },
        { findings: [{ documentId: "c" }] },
      ]),
    ).toEqual(["a", "b", "c"])
  })
})

describe("unused sources", () => {
  it("splits excluded, not cited, and missing privileged roles", () => {
    const report = buildUnusedSourceReport({
      documents: [
        { id: "v", title: "Vision", documentRole: "environmental_vision" },
        { id: "p", title: "Policy", documentRole: "existing_policy" },
        { id: "x", title: "Extra note", documentRole: "other" },
      ],
      sourceDocumentIds: ["v", "p"],
      citedDocumentIds: ["v"],
      requiredRoles: ["environmental_vision", "environmental_effects_report"],
    })
    expect(report.some((item) => item.kind === "excluded" && item.id === "x")).toBe(true)
    expect(report.some((item) => item.kind === "not_cited" && item.id === "p")).toBe(true)
    expect(report.some((item) => item.kind === "should_have_used" && item.role === "environmental_effects_report")).toBe(
      true,
    )
    expect(unusedDocumentIdsFromReport(report).sort()).toEqual(["p", "x"])
  })
})
