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

  it("returns false for non-public documents", () => {
    expect(shouldSyncSpaceDocument("document", "internal")).toBe(false)
  })

  it("returns false for non-document items", () => {
    expect(shouldSyncSpaceDocument("policy", "public")).toBe(false)
  })
})

