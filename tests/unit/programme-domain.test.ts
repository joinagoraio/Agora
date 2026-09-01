import {
  emptyProgrammeBindings,
  getWorkspaceKind,
  isDocumentRole,
  isEnvironmentalProgrammeWorkspace,
  isProgrammeWorkbenchSection,
  parseProgrammeBindings,
  documentOriginFromMetadata,
  resolveWorkspaceKind,
  buildOutlineTree,
  outlineNodesToTipTapHtml,
  tipTapHtmlToOutlineDrafts,
  moveOutlineSibling,
  type ProgrammeOutlineNode,
  workspaceHomeHref,
} from "@/lib/programme/domain"

describe("programme domain (Phase 0)", () => {
  it("defaults workspace kind to research", () => {
    expect(getWorkspaceKind(null)).toBe("research")
    expect(getWorkspaceKind({ kind: "environmental_programme" })).toBe("environmental_programme")
  })

  it("resolves programme workspace kind from column or metadata", () => {
    expect(resolveWorkspaceKind({ kind: "environmental_programme" })).toBe("environmental_programme")
    expect(resolveWorkspaceKind({ kind: null, metadata: { kind: "environmental_programme" } })).toBe(
      "environmental_programme",
    )
    expect(isEnvironmentalProgrammeWorkspace({ kind: "research" })).toBe(false)
    expect(workspaceHomeHref({ id: "ws-1", kind: "environmental_programme" })).toBe("/workspaces/ws-1/programme")
    expect(workspaceHomeHref({ id: "ws-2", kind: "research" })).toBe("/workspaces/ws-2")
    expect(isProgrammeWorkbenchSection("overview")).toBe(true)
    expect(isProgrammeWorkbenchSection("outline")).toBe(true)
    expect(isProgrammeWorkbenchSection("nope")).toBe(false)
  })

  it("maps document metadata origin for the Documents list", () => {
    expect(documentOriginFromMetadata({ origin: "space_scope" })).toBe("authority")
    expect(documentOriginFromMetadata({ origin: "workspace_generated" })).toBe("generated")
    expect(documentOriginFromMetadata({ origin: "published_programme" })).toBe("published")
    expect(documentOriginFromMetadata({})).toBe("uploaded")
    expect(documentOriginFromMetadata(null)).toBe("uploaded")
  })

  it("validates document roles and parses bindings", () => {
    expect(isDocumentRole("environmental_vision")).toBe(true)
    expect(isDocumentRole("nope")).toBe(false)
    const bindings = parseProgrammeBindings({
      programmeBindings: {
        environmentalVisionDocumentIds: ["a"],
        playbookId: "pb-1",
      },
    })
    expect(bindings.environmentalVisionDocumentIds).toEqual(["a"])
    expect(bindings.playbookId).toBe("pb-1")
    expect(bindings.agentBindings).toEqual({})
    expect(emptyProgrammeBindings().housingProgrammeDocumentIds).toEqual([])
    expect(emptyProgrammeBindings().existingPolicyDocumentIds).toEqual([])
  })

  it("parses per-stage agent bindings", () => {
    const bindings = parseProgrammeBindings({
      programmeBindings: {
        agentBindings: {
          measures: "agent-1",
          analysis: "agent-2",
          nope: "x",
        },
      },
    })
    expect(bindings.agentBindings).toEqual({ measures: "agent-1", analysis: "agent-2" })
  })

  it("parses chapterDocuments map on programme bindings", () => {
    const bindings = parseProgrammeBindings({
      programmeBindings: {
        chapterDocuments: {
          "node-1": "doc-1",
          bad: 123,
        },
      },
    })
    expect(bindings.chapterDocuments).toEqual({ "node-1": "doc-1" })
    expect(emptyProgrammeBindings().chapterDocuments).toEqual({})
  })
})

describe("programme outline helpers", () => {
  const extra = {
    instructions: null as string | null,
    fieldSpecs: [] as ProgrammeOutlineNode["fieldSpecs"],
    qualityRules: null as string | null,
    outputForm: null as string | null,
    relationHints: null as string | null,
  }
  const nodes: ProgrammeOutlineNode[] = [
    {
      id: "b",
      templateId: "t1",
      parentId: null,
      title: "Second",
      purpose: "B purpose",
      required: true,
      sortOrder: 2,
      ...extra,
    },
    {
      id: "a",
      templateId: "t1",
      parentId: null,
      title: "First",
      purpose: "A purpose",
      required: true,
      sortOrder: 1,
      ...extra,
    },
    {
      id: "a1",
      templateId: "t1",
      parentId: "a",
      title: "Child",
      purpose: null,
      required: false,
      sortOrder: 1,
      ...extra,
    },
  ]

  it("builds a sorted tree with children", () => {
    const tree = buildOutlineTree(nodes)
    expect(tree.map((n) => n.id)).toEqual(["a", "b"])
    expect(tree[0].children.map((n) => n.id)).toEqual(["a1"])
  })

  it("round-trips outline nodes through TipTap HTML", () => {
    const html = outlineNodesToTipTapHtml(nodes.filter((n) => !n.parentId))
    expect(html).toContain('data-outline-id="a"')
    expect(html).toContain("First")
    const drafts = tipTapHtmlToOutlineDrafts(html)
    expect(drafts).toHaveLength(2)
    expect(drafts[0].id).toBe("a")
    expect(drafts[0].title).toBe("First")
    expect(drafts[1].id).toBe("b")
  })

  it("moves siblings up and down", () => {
    const flat = nodes.filter((n) => !n.parentId)
    const up = moveOutlineSibling(flat, "b", "up")
    expect(up.find((n) => n.id === "b")!.sortOrder).toBeLessThan(up.find((n) => n.id === "a")!.sortOrder)
  })
})
