import { describe, expect, it } from "vitest"
import { isAllowedDocumentHost, isSupabaseStorageUrl } from "@/lib/utils/storage-url"

describe("storage-url", () => {
  it("treats hosted Supabase storage URLs as storage", () => {
    expect(
      isSupabaseStorageUrl("https://abc.supabase.co/storage/v1/object/public/documents/a.pdf"),
    ).toBe(true)
  })

  it("treats the configured self-hosted API origin as storage", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://api.agora.example.com"
    expect(
      isSupabaseStorageUrl("https://api.agora.example.com/storage/v1/object/public/documents/a.pdf"),
    ).toBe(true)
    expect(isAllowedDocumentHost("api.agora.example.com")).toBe(true)
    process.env.NEXT_PUBLIC_SUPABASE_URL = previous
  })

  it("rejects unrelated hosts", () => {
    expect(isSupabaseStorageUrl("https://evil.example/storage/v1/object/public/documents/a.pdf")).toBe(false)
    expect(isAllowedDocumentHost("evil.example")).toBe(false)
  })
})
