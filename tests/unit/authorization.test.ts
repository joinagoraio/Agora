import { describe, it, expect, vi, beforeEach } from "vitest"
import { getUserSpaceRole, getUserWorkspaceRole, checkPermission, requirePermission } from "@/lib/middleware/authorization"
import { createClient } from "@/lib/supabase/server"

// Mock Supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

describe("Authorization Middleware", () => {
  const mockSupabase = {
    from: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockReturnValue(mockSupabase as any)
  })

  describe("getUserSpaceRole", () => {
    it("returns role when user is a member", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "tenant_admin" },
        }),
      }

      mockSupabase.from.mockReturnValue(mockQuery as any)

      const role = await getUserSpaceRole("user-1", "space-1")

      expect(role).toBe("tenant_admin")
      expect(mockSupabase.from).toHaveBeenCalledWith("space_members")
      expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mockQuery.eq).toHaveBeenCalledWith("space_id", "space-1")
    })

    it("returns null when user is not a member", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
        }),
      }

      mockSupabase.from.mockReturnValue(mockQuery as any)

      const role = await getUserSpaceRole("user-1", "space-1")

      expect(role).toBeNull()
    })
  })

  describe("getUserWorkspaceRole", () => {
    it("returns role via parent space", async () => {
      const workspaceQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { space_id: "space-1" },
        }),
      }

      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "org_manager" },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(workspaceQuery as any)
        .mockReturnValueOnce(membershipQuery as any)

      const role = await getUserWorkspaceRole("user-1", "workspace-1")

      expect(role).toBe("org_manager")
    })

    it("returns null when workspace not found", async () => {
      const workspaceQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
        }),
      }

      mockSupabase.from.mockReturnValue(workspaceQuery as any)

      const role = await getUserWorkspaceRole("user-1", "workspace-1")

      expect(role).toBeNull()
    })
  })

  describe("checkPermission", () => {
    it("allows operation when user has permission", async () => {
      const workspaceQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { space_id: "space-1" },
        }),
      }

      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "tenant_admin" },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(workspaceQuery as any)
        .mockReturnValueOnce(membershipQuery as any)

      const result = await checkPermission("user-1", "workspace:delete", {
        workspaceId: "workspace-1",
      })

      expect(result.allowed).toBe(true)
      expect(result.role).toBe("tenant_admin")
      expect(result.error).toBeUndefined()
    })

    it("denies operation when user lacks permission", async () => {
      const workspaceQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { space_id: "space-1" },
        }),
      }

      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "viewer" },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(workspaceQuery as any)
        .mockReturnValueOnce(membershipQuery as any)

      const result = await checkPermission("user-1", "workspace:delete", {
        workspaceId: "workspace-1",
      })

      expect(result.allowed).toBe(false)
      expect(result.role).toBe("viewer")
      expect(result.error).toBe("Insufficient permissions")
    })

    it("returns error when context is missing", async () => {
      const result = await checkPermission("user-1", "workspace:delete", {})

      expect(result.allowed).toBe(false)
      expect(result.error).toBe("Either spaceId or workspaceId must be provided")
    })
  })

  describe("requirePermission", () => {
    it("returns role when permission is granted", async () => {
      const workspaceQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { space_id: "space-1" },
        }),
      }

      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "tenant_admin" },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(workspaceQuery as any)
        .mockReturnValueOnce(membershipQuery as any)

      const role = await requirePermission("user-1", "workspace:delete", {
        workspaceId: "workspace-1",
      })

      expect(role).toBe("tenant_admin")
    })

    it("throws error when permission is denied", async () => {
      const workspaceQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { space_id: "space-1" },
        }),
      }

      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "viewer" },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(workspaceQuery as any)
        .mockReturnValueOnce(membershipQuery as any)

      await expect(
        requirePermission("user-1", "workspace:delete", {
          workspaceId: "workspace-1",
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })
})

