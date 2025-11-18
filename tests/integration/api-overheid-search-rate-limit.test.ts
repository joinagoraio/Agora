import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { GET } from "@/app/api/overheid-search/route"
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

describe("Overheid search API rate limits", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const sampleXml = `
    <srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
      <srw:numberOfRecords>1</srw:numberOfRecords>
      <srw:records>
        <srw:record>
          <dcterms:title xmlns:dcterms="http://purl.org/dc/terms/">Test Title</dcterms:title>
          <dcterms:identifier xmlns:dcterms="http://purl.org/dc/terms/">test-id</dcterms:identifier>
          <dcterms:type xmlns:dcterms="http://purl.org/dc/terms/">Document</dcterms:type>
        </srw:record>
      </srw:records>
    </srw:searchRetrieveResponse>
  `

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    vi.mocked(checkRateLimit).mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
    })

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => sampleXml,
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("attaches rate limit headers on success", async () => {
    const url = new URL("http://localhost/api/overheid-search?query=veiligheid")
    const request = {
      headers: new Headers(),
      nextUrl: url,
    } as unknown as NextRequest

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("ratelimit-limit")).toBe("20")
    expect(response.headers.get("ratelimit-remaining")).toBe("19")
    expect(response.headers.get("ratelimit-reset")).toBeTruthy()

    const payload = await response.json()
    expect(payload.results).toHaveLength(1)
  })
})


