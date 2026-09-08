import {
  emptyProgrammeBindings,
  getWorkspaceKind,
  isDocumentRole,
  isEnvironmentalProgrammeWorkspace,
  isProgrammeWorkbenchSection,
  parseProgrammeBindings,
  documentOriginFromMetadata,
  resolveWorkspaceKind,
  splitAuthorityDeleteImpact,
  summarizeTemplates,
  buildOutlineTree,
  outlineNodesToTipTapHtml,
  outlinePurposePlainText,
  moveOutlineNodeId,
  insertOutlineNodeAt,
  tipTapHtmlToOutlineDrafts,
  moveOutlineSibling,
  boundChapterAgentId,
  resolveDraftAgentId,
  unbindAgentFromProgrammeBindings,
  agentHistoryVersionDeleteReason,
  hasAllDefaultSpaceAgents,
  isLatestAgentHistoryVersion,
  matchingAgentVersionNumber,
  type ProgrammeOutlineNode,
  workspaceHomeHref,
} from "@/lib/programme/domain"

describe("programme domain (Phase 0)", () => {
  it("summarizes template chapter counts in sort order", () => {
    const summaries = summarizeTemplates(
      [
        {
          id: "t1",
          spaceId: "s1",
          name: "Handbook",
          qualityRules: null,
          outputForm: null,
          createdAt: "2026-01-01",
        },
        {
          id: "t2",
          spaceId: "s1",
          name: "Empty",
          qualityRules: null,
          outputForm: null,
          createdAt: "2026-01-02",
        },
      ],
      [
        { templateId: "t1", title: "B", required: false, sortOrder: 2 },
        { templateId: "t1", title: "A", required: true, sortOrder: 1 },
      ],
    )
    expect(summaries[0]).toMatchObject({
      id: "t1",
      chapterCount: 2,
      requiredCount: 1,
      chapterTitles: ["A", "B"],
    })
    expect(summaries[1]).toMatchObject({
      id: "t2",
      chapterCount: 0,
      requiredCount: 0,
      chapterTitles: [],
    })
  })

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
    expect(isProgrammeWorkbenchSection("agents")).toBe(true)
    expect(isProgrammeWorkbenchSection("nope")).toBe(false)
  })

  it("lists programmes that cascade when an authority is deleted", () => {
    expect(
      splitAuthorityDeleteImpact([
        { id: "b", name: "Noise and air quality", kind: "environmental_programme" },
        { id: "a", name: "Bicycle network gaps", kind: "environmental_programme" },
        { id: "legacy", name: "Old research", kind: "research" },
      ]),
    ).toEqual({
      programmes: [
        { id: "a", name: "Bicycle network gaps" },
        { id: "b", name: "Noise and air quality" },
      ],
      legacyCount: 1,
    })
    expect(splitAuthorityDeleteImpact([])).toEqual({ programmes: [], legacyCount: 0 })
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

  it("parses chapter agent bindings and resolves draft agent fallback", () => {
    const bindings = parseProgrammeBindings({
      programmeBindings: {
        agentBindings: { draft: "agent-draft" },
        chapterAgentBindings: {
          "chapter-1": "agent-chapter",
          bad: 1,
        },
      },
    })
    expect(bindings.chapterAgentBindings).toEqual({ "chapter-1": "agent-chapter" })
    expect(boundChapterAgentId(bindings, "chapter-1")).toBe("agent-chapter")
    expect(boundChapterAgentId(bindings, "chapter-2")).toBeNull()
    expect(resolveDraftAgentId(bindings, "chapter-1")).toBe("agent-chapter")
    expect(resolveDraftAgentId(bindings, "chapter-2")).toBe("agent-draft")
    expect(resolveDraftAgentId(bindings, null)).toBe("agent-draft")
  })

  it("unbinds a deleted agent from programme and chapter bindings", () => {
    const bindings = parseProgrammeBindings({
      programmeBindings: {
        agentBindings: { draft: "agent-draft", qc: "agent-qc" },
        chapterAgentBindings: { "chapter-1": "agent-draft", "chapter-2": "agent-other" },
      },
    })
    const next = unbindAgentFromProgrammeBindings(bindings, "agent-draft")
    expect(next.agentBindings).toEqual({ qc: "agent-qc" })
    expect(next.chapterAgentBindings).toEqual({ "chapter-2": "agent-other" })
    expect(unbindAgentFromProgrammeBindings(bindings, "missing").agentBindings).toEqual(bindings.agentBindings)
  })

  it("hides default specialist seeding once every catalog name exists", () => {
    const complete = [
      "Policy analyst",
      "Vision graph specialist",
      "Measures author",
      "Effects specialist",
      "Quality controller",
      "Chapter drafter",
    ].map((name) => ({ name }))
    expect(hasAllDefaultSpaceAgents(complete)).toBe(true)
    expect(hasAllDefaultSpaceAgents([...complete, { name: "Policy analyst (OpenAI-compatible)" }])).toBe(true)
    expect(hasAllDefaultSpaceAgents(complete.filter((agent) => agent.name !== "Chapter drafter"))).toBe(false)
    expect(hasAllDefaultSpaceAgents([])).toBe(false)
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

  it("strips HTML from outline purpose text", () => {
    expect(outlinePurposePlainText("<p>Hello<br/>world</p>")).toBe("Hello\nworld")
    expect(outlinePurposePlainText("  already plain  ")).toBe("already plain")
    expect(outlinePurposePlainText(null)).toBe("")
  })

  it("moves an outline node before another or to the end", () => {
    expect(moveOutlineNodeId(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"])
    expect(moveOutlineNodeId(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"])
    expect(moveOutlineNodeId(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"])
  })

  it("inserts an outline node at an index among the remaining items", () => {
    expect(insertOutlineNodeAt(["a", "b", "c"], "b", 0)).toEqual(["b", "a", "c"])
    expect(insertOutlineNodeAt(["a", "b", "c"], "b", 2)).toEqual(["a", "c", "b"])
    expect(insertOutlineNodeAt(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"])
    expect(insertOutlineNodeAt(["a", "b", "c"], "a", 0)).toEqual(["a", "b", "c"])
  })

  it("guards agent history deletes and identifies the current version", () => {
    const versions = [
      { id: "v3", version: 3 },
      { id: "v1", version: 1 },
    ]
    expect(agentHistoryVersionDeleteReason(versions, "v1")).toBeNull()
    expect(agentHistoryVersionDeleteReason([{ id: "v1" }], "v1")).toBe("only")
    expect(agentHistoryVersionDeleteReason(versions, "missing")).toBe("missing")
    expect(isLatestAgentHistoryVersion(versions, "v3")).toBe(true)
    expect(isLatestAgentHistoryVersion(versions, "v1")).toBe(false)
    expect(isLatestAgentHistoryVersion([], "v1")).toBe(false)
  })

  it("finds the latest version with the same method and instructions", () => {
    const versions = [
      { version: 2, instructions: "Draft the chapter.", qualityRules: "Cite sources." },
      { version: 1, instructions: "Draft the chapter.", qualityRules: "Cite sources." },
    ]
    expect(matchingAgentVersionNumber(versions, { instructions: "Draft the chapter.", qualityRules: "Cite sources." })).toBe(2)
    expect(matchingAgentVersionNumber(versions, { instructions: "Draft the chapter.", qualityRules: "Be brief." })).toBeNull()
    expect(matchingAgentVersionNumber(versions, { instructions: "Draft the chapter. ", qualityRules: "Cite sources." })).toBeNull()
    expect(matchingAgentVersionNumber([], { instructions: "Draft the chapter.", qualityRules: "Cite sources." })).toBeNull()
  })
})
