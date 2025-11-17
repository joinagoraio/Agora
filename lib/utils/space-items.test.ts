import { describe, expect, it } from "vitest"

import { resolveSpaceItemClassification, shouldSyncSpaceDocument } from "./space-items"

describe("resolveSpaceItemClassification", () => {
  it("defaults document classification to public when not provided", () => {
    expect(resolveSpaceItemClassification("document", undefined)).toBe("public")
  })

  it("defaults non-document classification to internal when not provided", () => {
    expect(resolveSpaceItemClassification("policy", undefined)).toBe("internal")
  })

  it("preserves provided classification", () => {
    expect(resolveSpaceItemClassification("document", "confidential")).toBe("confidential")
  })
})

describe("shouldSyncSpaceDocument", () => {
  it("returns true for public documents", () => {
    expect(shouldSyncSpaceDocument("document", "public")).toBe(true)
  })

  it("returns true when visibility is public even if classification is internal", () => {
    expect(shouldSyncSpaceDocument("document", "internal", "public")).toBe(true)
  })

  it("returns false when both classification and visibility are non-public", () => {
    expect(shouldSyncSpaceDocument("document", "internal", "confidential")).toBe(false)
  })

  it("returns false for non-document items", () => {
    expect(shouldSyncSpaceDocument("policy", "public")).toBe(false)
  })
})

