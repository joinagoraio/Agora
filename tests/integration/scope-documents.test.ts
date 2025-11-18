import { describe, it, expect, beforeEach, vi, type Mock } from "vitest"

import {
  syncAllScopeDocumentsToWorkspace,
  syncScopeDocumentToAllWorkspaces,
  type SpaceDocumentItem,
} from "../../lib/services/scope-documents"
import { createAdminClient } from "../../lib/supabase/admin"

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

type QueryResult<T> = Promise<{ data: T; error: null }>

function createSimpleQuery<T>(getData: () => T) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: getData(), error: null }),
  }
}

function createSpaceItemsQuery(getData: () => any[]) {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((column: string) => {
      if (column === "space_id") {
        return query
      }
      if (column === "item_type") {
        return Promise.resolve({ data: getData(), error: null })
      }
      return query
    }),
  }
  return query
}

describe("scope document synchronization", () => {
  const createAdminClientMock = createAdminClient as unknown as Mock
  let adminClient: { from: Mock }
  let spaceItemsData: SpaceDocumentItem[]
  let workspacesData: { id: string }[]
  let workspaceLinksData: { workspace_id: string }[]

  beforeEach(() => {
    spaceItemsData = []
    workspacesData = []
    workspaceLinksData = []

    adminClient = {
      from: vi.fn((table: string) => {
        if (table === "space_items") {
          return createSpaceItemsQuery(() => spaceItemsData)
        }
        if (table === "workspaces") {
          return createSimpleQuery(() => workspacesData)
        }
        if (table === "workspace_space_links") {
          return createSimpleQuery(() => workspaceLinksData)
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    createAdminClientMock.mockReturnValue(adminClient)
  })

  it("syncAllScopeDocumentsToWorkspace only upserts public or visible documents", async () => {
    spaceItemsData = [
      { id: "doc-public", classification: "public", visibility: "internal", payload: {} },
      { id: "doc-visible", classification: "internal", visibility: "public", payload: {} },
      { id: "doc-private", classification: "internal", visibility: "internal", payload: {} },
    ] as SpaceDocumentItem[]

    const upsertFn = vi.fn().mockResolvedValue(true)

    const result = await syncAllScopeDocumentsToWorkspace("space-1", "workspace-1", undefined, upsertFn)

    expect(upsertFn).toHaveBeenCalledTimes(2)
    expect(upsertFn).toHaveBeenNthCalledWith(1, "space-1", "workspace-1", spaceItemsData[0], expect.any(Object))
    expect(upsertFn).toHaveBeenNthCalledWith(2, "space-1", "workspace-1", spaceItemsData[1], expect.any(Object))
    expect(result.syncedCount).toBe(2)
  })

  it("syncAllScopeDocumentsToWorkspace surfaces upsert failures", async () => {
    spaceItemsData = [{ id: "doc-public", classification: "public", visibility: "internal", payload: {} }] as SpaceDocumentItem[]
    const upsertFn = vi.fn().mockResolvedValue(false)

    await expect(syncAllScopeDocumentsToWorkspace("space-1", "workspace-1", undefined, upsertFn)).rejects.toThrow(
      /Failed to sync 1 scope document/,
    )
  })

  it("syncScopeDocumentToAllWorkspaces aggregates owned and linked workspaces", async () => {
    workspacesData = [{ id: "workspace-owned" }]
    workspaceLinksData = [{ workspace_id: "workspace-owned" }, { workspace_id: "workspace-linked" }]
    const spaceItem: SpaceDocumentItem = {
      id: "item",
      classification: "public",
      visibility: "internal",
      payload: {},
    }

    const upsertFn = vi.fn().mockResolvedValue(true)

    await syncScopeDocumentToAllWorkspaces("space-1", spaceItem, undefined, upsertFn)

    const workspaceIdsProcessed = upsertFn.mock.calls.map((call) => call[1])
    expect(workspaceIdsProcessed.sort()).toEqual(["workspace-linked", "workspace-owned"])
  })
})

