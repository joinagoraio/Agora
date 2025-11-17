import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Mock } from "vitest"

import { getInheritedItems } from "../../lib/actions/workspace-space-link"
import { createClient } from "../../lib/supabase/server"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

type WorkspaceSpaceLinkRecord = { space_id: string }
type SpaceItemRecord = { id: string; visibility?: string | null; classification?: string | null }

describe("getInheritedItems", () => {
  let mockedCreateClient: Mock
  let supabaseMock: any
  let workspaceLinksData: WorkspaceSpaceLinkRecord[]
  let spaceItemsData: SpaceItemRecord[]
  let workspaceLinksQuery: any
  let spaceItemsQuery: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateClient = createClient as unknown as Mock

    workspaceLinksData = []
    spaceItemsData = []

    workspaceLinksQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: workspaceLinksData,
        }),
      ),
    }

    spaceItemsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: spaceItemsData,
        }),
      ),
    }

    supabaseMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "workspace_space_links") {
          return workspaceLinksQuery
        }
        if (table === "space_items") {
          return spaceItemsQuery
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    mockedCreateClient.mockResolvedValue(supabaseMock)
  })

  it("returns unauthorized when user is missing", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
    })

    const result = await getInheritedItems("workspace-1")

    expect(result.error).toBe("Unauthorized")
    expect(result.data).toEqual([])
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it("returns empty data when workspace has no parent spaces", async () => {
    workspaceLinksData = []

    const result = await getInheritedItems("workspace-1")

    expect(result.data).toEqual([])
    expect(spaceItemsQuery.select).not.toHaveBeenCalled()
  })

  it("fetches inherited items filtering by visibility or classification", async () => {
    workspaceLinksData = [{ space_id: "space-1" }, { space_id: "space-2" }]
    spaceItemsData = [
      { id: "item-public", visibility: "public", classification: "internal" },
      { id: "item-classified", visibility: "internal", classification: "public" },
    ]

    const result = await getInheritedItems("workspace-1")

    expect(spaceItemsQuery.in).toHaveBeenCalledWith("space_id", ["space-1", "space-2"])
    expect(spaceItemsQuery.or).toHaveBeenCalledWith("visibility.eq.public,classification.eq.public")
    expect(result.data).toEqual(spaceItemsData)
  })
})

