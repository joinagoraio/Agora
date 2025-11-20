import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { POST } from "@/app/api/spaces/[spaceId]/documents/upload/route"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { publishSpaceItem } from "@/lib/actions/space-item"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

vi.mock("@/lib/actions/space-item", () => ({
  publishSpaceItem: vi.fn(),
}))

describe("Space document upload route", () => {
  const spaceId = "11111111-2222-3333-4444-555555555555"

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "user-123" },
          },
        }),
      },
    } as any)

    vi.mocked(createAdminClient).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: "https://example.com/doc.pdf" },
          }),
        }),
      },
    } as any)

    vi.mocked(publishSpaceItem).mockResolvedValue({
      data: { id: "space-item-1" },
    } as any)
  })

  it("accepts a basic text upload", async () => {
    const file = new File(["Hello scope"], "notes.txt", { type: "text/plain" })
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", "Scope notes")
    formData.append("classification", "internal")
    formData.append("notes", "Quick summary")

    const request = new NextRequest("http://localhost/api/spaces/upload", {
      method: "POST",
      body: formData,
    })

    const response = await POST(request, { params: Promise.resolve({ spaceId }) })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data.id).toBe("space-item-1")
    expect(vi.mocked(publishSpaceItem)).toHaveBeenCalledWith(
      spaceId,
      expect.objectContaining({
        item_type: "document",
        payload: expect.objectContaining({
          title: "Scope notes",
        }),
      }),
    )
  })
})


