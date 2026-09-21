import { describe, expect, it } from "vitest"
import { defaultSourceRolesForStage, emptyProgrammeBindings } from "@/lib/programme/domain"
import {
  applyDocumentRoleToBindings,
  bindingIdsForRoles,
  expandSourceRolesWhenEmpty,
  isChapterDocumentId,
  listBoundDocumentsForHelp,
  sourceRolesForAgent,
} from "@/lib/programme/source-set-bindings"

describe("programme source set bindings", () => {
  it("maps roles onto the matching binding arrays and removes on clear", () => {
    const start = emptyProgrammeBindings()
    const withVision = applyDocumentRoleToBindings(start, "doc-v", "environmental_vision")
    const withPolicy = applyDocumentRoleToBindings(withVision, "doc-p", "existing_policy")
    expect(withPolicy.environmentalVisionDocumentIds).toEqual(["doc-v"])
    expect(withPolicy.existingPolicyDocumentIds).toEqual(["doc-p"])

    const moved = applyDocumentRoleToBindings(withPolicy, "doc-v", "housing_programme")
    expect(moved.environmentalVisionDocumentIds).toEqual([])
    expect(moved.housingProgrammeDocumentIds).toEqual(["doc-v"])

    const cleared = applyDocumentRoleToBindings(moved, "doc-p", null)
    expect(cleared.existingPolicyDocumentIds).toEqual([])
  })

  it("falls back to default stage roles when the agent version has none", () => {
    expect(sourceRolesForAgent({ versionRoles: [], fallbackRoles: ["environmental_vision"] })).toEqual([
      "environmental_vision",
    ])
    expect(
      sourceRolesForAgent({
        versionRoles: ["quality_style_rules"],
        fallbackRoles: ["environmental_vision"],
      }),
    ).toEqual(["quality_style_rules"])
    expect(
      expandSourceRolesWhenEmpty({
        roles: ["quality_style_rules"],
        fallbackRoles: defaultSourceRolesForStage("qc"),
      }),
    ).toEqual(expect.arrayContaining(["quality_style_rules", "environmental_vision", "programme_handbook"]))
  })

  it("collects binding ids only for the agent source roles", () => {
    const bindings = applyDocumentRoleToBindings(
      applyDocumentRoleToBindings(emptyProgrammeBindings(), "vis", "environmental_vision"),
      "pol",
      "existing_policy",
    )
    expect(bindingIdsForRoles(bindings, ["environmental_vision", "existing_policy"])).toEqual(
      expect.arrayContaining(["vis", "pol"]),
    )
    expect(bindingIdsForRoles(bindings, ["environmental_effects_report"])).toEqual([])
  })

  it("recognises chapter drafts so they are not treated as corpus", () => {
    const bindings = {
      ...emptyProgrammeBindings(),
      chapterDocuments: { "node-1": "chapter-doc" },
    }
    expect(isChapterDocumentId(bindings, "chapter-doc")).toBe(true)
    expect(isChapterDocumentId(bindings, "vis")).toBe(false)
  })

  it("lists only bound files with roles for Help, not chapter drafts", () => {
    const bindings = applyDocumentRoleToBindings(
      {
        ...emptyProgrammeBindings(),
        chapterDocuments: { "node-1": "chapter-doc" },
      },
      "vis",
      "environmental_vision",
    )
    expect(
      listBoundDocumentsForHelp(
        [
          { id: "vis", title: "Environmental vision — housing near nodes (fixture)", document_role: null },
          { id: "chapter-doc", title: "Challenges and goals", document_role: null },
          { id: "loose", title: "Unassigned upload", document_role: null },
        ],
        bindings,
      ),
    ).toEqual([
      {
        title: "Environmental vision — housing near nodes (fixture)",
        role: "environmental_vision",
      },
    ])
  })
})
