import { describe, it, expect, beforeEach, vi } from "vitest"
import type { NextRequest } from "next/server"
import { POST } from "@/app/api/documents/upload/route"
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "source" } }),
    storage: {
      from: vi.fn().mockReturnThis(),
      upload: vi.fn().mockResolvedValue({}),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/doc.pdf" } }),
      remove: vi.fn(),
    },
  })),
}))

describe("Upload API rate limits", () => {
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
      limit: 5,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
    })

    const request = {
      headers: new Headers(),
      formData: vi.fn(),
    } as unknown as NextRequest

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(payload.error).toContain("rate limit")
    expect(response.headers.get("ratelimit-limit")).toBe("5")
    expect(response.headers.get("ratelimit-remaining")).toBe("0")
    expect(response.headers.get("retry-after")).toBeDefined()
  })
})


