import { describe, it, expect, beforeEach, vi } from "vitest"
import { POST } from "@/app/api/help/route"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { completeLlm } from "@/lib/llm/complete"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")
  return {
    ...actual,
    checkRateLimit: vi.fn(),
  }
})

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env")
  return {
    ...actual,
    isHelpAiEnabled: () => true,
  }
})

vi.mock("@/lib/llm/complete", () => ({
  completeLlm: vi.fn(),
}))

describe("Help API refusal", () => {
  const from = vi.fn()
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from,
  }
  const adminFrom = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    vi.mocked(createAdminClient).mockReturnValue({ from: adminFrom } as never)
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    vi.mocked(checkRateLimit).mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 })
    from.mockImplementation((table: string) => {
      if (table === "help_conversations") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "00000000-0000-0000-0000-000000000099" }, error: null }),
            }),
          }),
        }
      }
      if (table === "help_messages") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { space_id: "s1" }, error: null }),
          }),
        }),
      }
    })
    adminFrom.mockImplementation((table: string) => {
      if (table === "help_conversations") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "00000000-0000-0000-0000-000000000099" }, error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })
  })

  it("returns canned refusal for write chapter 3 and does not call completeLlm", async () => {
    const response = await POST(
      new Request("http://localhost/api/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "write chapter 3",
          workspaceId: "00000000-0000-0000-0000-000000000001",
        }),
      }),
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.refused).toBe(true)
    expect(payload.text).toMatch(/cannot draft policy/i)
    expect(completeLlm).not.toHaveBeenCalled()
  })
})
