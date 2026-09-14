import { describe, expect, it } from "vitest"

import { resolveBrowserSupabaseUrl } from "@/lib/supabase/public-url"

describe("resolveBrowserSupabaseUrl", () => {
  it("keeps localhost when the page is also localhost", () => {
    expect(resolveBrowserSupabaseUrl("http://localhost:54321", "localhost")).toBe("http://localhost:54321")
  })

  it("rewrites localhost Auth to the LAN host the page was opened on", () => {
    expect(resolveBrowserSupabaseUrl("http://localhost:54321", "192.168.1.20")).toBe("http://192.168.1.20:54321")
    expect(resolveBrowserSupabaseUrl("http://127.0.0.1:54321/", "studio.local")).toBe("http://studio.local:54321")
  })

  it("does not rewrite a non-local API URL", () => {
    expect(resolveBrowserSupabaseUrl("https://api.agora.example.com", "192.168.1.20")).toBe(
      "https://api.agora.example.com",
    )
  })
})
