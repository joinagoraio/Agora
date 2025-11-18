import { describe, it, expect, beforeEach, vi } from "vitest"
import type { NextRequest } from "next/server"
import { POST } from "@/app/api/evidence/save/route"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { saveEvidenceToWorkspace } from "@/lib/actions/workspace-item"
import { getConversation } from "@/lib/actions/conversation"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/actions/workspace-item", () => ({
  saveEvidenceToWorkspace: vi.fn(),
}))

vi.mock("@/lib/actions/conversation", () => ({
  getConversation: vi.fn(),
}))

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")
  return {
    ...actual,
    checkRateLimit: vi.fn(),
  }
})

describe("Evidence save API rate limits", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    vi.mocked(checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    })

    vi.mocked(saveEvidenceToWorkspace).mockResolvedValue({ data: { id: "evidence-1" } })
    vi.mocked(getConversation).mockResolvedValue({ data: null })
  })

  it("attaches rate limit headers on success", async () => {
    const body = {
      workspaceId: "00000000-0000-0000-0000-000000000001",
      question: "Q?",
      answer: "A",
      citations: [],
      confidence: "high",
    }

    const request = {
      headers: new Headers(),
      json: async () => body,
    } as unknown as NextRequest

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(response.headers.get("ratelimit-limit")).toBe("10")
    expect(response.headers.get("ratelimit-remaining")).toBe("9")
    expect(response.headers.get("ratelimit-reset")).toBeTruthy()

    const payload = await response.json()
    expect(payload.data).toEqual({ id: "evidence-1" })
  })
})


