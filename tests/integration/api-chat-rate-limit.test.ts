import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request } from "next/server"
import { POST } from "@/app/api/chat/route"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")
  return {
    ...actual,
    checkRateLimit: vi.fn(),
  }
})

vi.mock(
  "@/lib/rag/search",
  () => ({
    getRelevantContext: vi.fn().mockResolvedValue({}),
  }),
  { virtual: true },
)

vi.mock(
  "@/lib/chat/context",
  () => ({
    buildWorkspaceContext: vi.fn().mockResolvedValue({}),
  }),
  { virtual: true },
)

describe("Chat API rate limits", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
  })

  it("returns headers when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
    })

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
        workspaceId: "00000000-0000-0000-0000-000000000001",
      }),
    }) as Request

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(payload.error).toContain("Too many chat requests")
    expect(response.headers.get("ratelimit-limit")).toBe("10")
    expect(response.headers.get("ratelimit-remaining")).toBe("0")
    expect(response.headers.get("retry-after")).toBeDefined()
  })
})


