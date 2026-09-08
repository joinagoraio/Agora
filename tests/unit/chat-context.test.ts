import { describe, it, expect } from "vitest"

import { buildWorkspaceContext } from "../../lib/chat/context"

const baseWorkspace = {
  name: "Climate Taskforce",
  context: "Focus on energy transition policies.",
  location: "Amsterdam",
  summary: "Improving sustainability across the organization.",
  description: "A detailed workspace focused on implementing climate policies and supporting local governments in their sustainability efforts.",
  metadata: {
    scope: {
      description: "Guide municipalities in drafting climate action plans.",
      timeframe: "2024-2026",
    },
  },
}

const baseSpace = {
  name: "EU Climate Mandate",
  description: "Alignment with EU directives.",
  metadata: {
    scope: {
      description: "Ensure compliance with Fit for 55",
      timeframe: "2024-2025",
    },
  },
  jurisdiction: {
    country: "Netherlands",
    region: "Noord-Holland",
  },
}

describe("buildWorkspaceContext", () => {
  it("returns empty section when no workspace or space data is provided", () => {
    const result = buildWorkspaceContext({})
    expect(result.workspaceContextSection).toBe("")
    expect(result.hasWorkspaceContext).toBe(false)
    expect(result.contextInstructions).toBe("")
  })

  it("includes workspace summary data and spacing once data is present", () => {
    const result = buildWorkspaceContext({ workspace: baseWorkspace })

    expect(result.workspaceContextSection).toContain("Programme name: Climate Taskforce")
    expect(result.workspaceContextSection).toContain("Programme additional AI context:\nFocus on energy transition policies.")
    expect(result.workspaceContextSection).toContain("Programme location: Amsterdam")
    expect(result.workspaceContextSection).toContain("Programme summary:\nImproving sustainability across the organization.")
    expect(result.workspaceContextSection).toContain(
      "Programme description:\nA detailed workspace focused on implementing climate policies",
    )
    expect(result.workspaceContextSection).toContain(
      "Programme scope details:\nGuide municipalities in drafting climate action plans.",
    )
    expect(result.workspaceContextSection).toContain("Programme timeframe: 2024-2026")
    expect(result.hasWorkspaceContext).toBe(true)
  })

  it("includes parent space metadata, dividers, and jurisdiction list", () => {
    const result = buildWorkspaceContext({ space: baseSpace })

    expect(result.workspaceContextSection).toContain("Authority name: EU Climate Mandate")
    expect(result.workspaceContextSection).not.toContain("Parent authority")
    expect(result.workspaceContextSection).toContain("Authority mission statement:\nAlignment with EU directives.")
    expect(result.workspaceContextSection).toContain("Authority description:\nEnsure compliance with Fit for 55")
    expect(result.workspaceContextSection).toContain("Authority timeframe: 2024-2025")
    expect(result.workspaceContextSection).toContain("Authority jurisdiction: Netherlands • Noord-Holland")
    expect(result.workspaceContextSection).not.toMatch(/workspace/i)
  })

  it("returns context instructions for document preview mode", () => {
    const result = buildWorkspaceContext({
      workspace: baseWorkspace,
      space: baseSpace,
      includeDocumentPreviewNotice: true,
    })

    expect(result.contextInstructions).toContain("document preview mode")
    expect(result.hasWorkspaceContext).toBe(true)
    expect(result.workspaceContextSection).toContain("Programme name: Climate Taskforce")
    expect(result.workspaceContextSection).toContain("Parent authority name: EU Climate Mandate")
  })
})

