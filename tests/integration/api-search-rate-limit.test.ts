import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { GET } from "@/app/api/search/route"
import { createClient } from "@/lib/supabase/server"
import { withCache } from "@/lib/cache/api-cache"
import { checkRateLimit } from "@/lib/rate-limit"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/cache/api-cache", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cache/api-cache")>(
    "@/lib/cache/api-cache",
  )
  return {
    ...actual,
    withCache: vi.fn(),
  }
})

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  )
  return {
    ...actual,
    checkRateLimit: vi.fn(),
  }
})

describe("Search API rate limit headers", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  }

  const mockDocumentsQuery = {
    select: vi
      .fn()
      .mockImplementation(function select(_columns?: string, options?: any) {
        if (options && options.count) {
          const countQuery = {
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (onFulfilled: any, onRejected?: any) =>
              Promise.resolve({ count: 1, data: null, error: null }).then(onFulfilled, onRejected),
          }
          countQuery.eq.mockReturnValue(countQuery)
          countQuery.or.mockReturnValue(countQuery)
          countQuery.gte.mockReturnValue(countQuery)
          countQuery.lte.mockReturnValue(countQuery)
          return countQuery
        }
        return mockDocumentsQuery
      }),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: [{ id: "doc-1", title: "Document" }],
        error: null,
      }),
    ),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "documents") {
        return mockDocumentsQuery
      }
      throw new Error(`Unexpected table ${table}`)
    })

    vi.mocked(withCache).mockImplementation(async (_key, fn) => fn())

    vi.mocked(checkRateLimit).mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
    })
  })

  it("attaches rate limit headers on successful GET", async () => {
    const url = new URL("http://localhost/api/search?workspaceId=00000000-0000-0000-0000-000000000001&query=test")
    const headers = new Headers()
    const request = {
      headers,
      nextUrl: url,
    } as unknown as NextRequest

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("ratelimit-limit")).toBe("20")
    expect(response.headers.get("ratelimit-remaining")).toBe("19")
    expect(response.headers.get("ratelimit-reset")).toBeTruthy()

    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.pagination).toBeDefined()
  })
})


