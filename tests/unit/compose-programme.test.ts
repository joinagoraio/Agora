import { describe, expect, it } from "vitest"
import { composeCitationGraph, composeProgrammeMarkdown } from "@/lib/export/compose-programme"
import { HANDBOOK_SEED_NODES } from "@/lib/programme/handbook-seed"
import type { ProgrammeOutlineNode } from "@/lib/programme/domain"

describe("compose programme", () => {
  const nodes: ProgrammeOutlineNode[] = HANDBOOK_SEED_NODES.slice(0, 2).map((n, i) => ({
    id: `n${i + 1}`,
    templateId: "t1",
    parentId: null,
    title: n.title,
    purpose: n.purpose,
    instructions: n.instructions,
    fieldSpecs: n.fieldSpecs,
    qualityRules: n.qualityRules,
    outputForm: n.outputForm,
    relationHints: n.relationHints,
    required: n.required,
    sortOrder: n.sortOrder,
  }))

  it("builds markdown from template + chapters + placed measures without a textarea", () => {
    const markdown = composeProgrammeMarkdown({
      title: "Flevoland programme",
      nodes,
      chapters: [{ node: nodes[0]!, title: nodes[0]!.title, html: "<p>Legal basis from the handbook.</p>" }],
      measures: [
        {
          id: "m1",
          title: "Station housing pilots",
          measureType: "measure",
          specificAction: "Fund two station-area pilots",
          outlineNodeId: nodes[1]!.id,
          citations: [{ documentId: "vision-1", quote: "housing near nodes" }],
          workflowStatus: "generated",
        },
      ],
    })
    expect(markdown).toContain("# Flevoland programme")
    expect(markdown).toContain(nodes[0]!.title)
    expect(markdown).toContain("Legal basis from the handbook")
    expect(markdown).toContain("Station housing pilots")
  })

  it("does not repeat an outline title that the chapter HTML already opens with", () => {
    const markdown = composeProgrammeMarkdown({
      title: "Energy programme",
      nodes: [nodes[0]!],
      chapters: [
        {
          node: nodes[0]!,
          title: nodes[0]!.title,
          html: `<h1>${nodes[0]!.title}</h1><p>Body after the title.</p>`,
        },
      ],
      measures: [],
    })
    const titleHits = markdown.split(nodes[0]!.title).length - 1
    expect(titleHits).toBe(1)
    expect(markdown).toContain("Body after the title.")
  })

  it("emits a citation graph matching the registry", () => {
    const graph = composeCitationGraph([
      {
        id: "m1",
        title: "Station housing pilots",
        measureType: "measure",
        specificAction: "Fund two station-area pilots",
        citations: [{ documentId: "vision-1", pageNumber: 4, quote: "nodes" }],
        workflowStatus: "approved",
      },
    ])
    expect(graph.nodes.some((n) => n.id === "m1")).toBe(true)
    expect(graph.nodes.some((n) => n.id === "vision-1")).toBe(true)
    expect(graph.edges).toHaveLength(1)
  })
})
