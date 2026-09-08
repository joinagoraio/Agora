import { describe, expect, it } from "vitest"
import { resolveConversationScope } from "@/lib/chat/conversation-scope"

describe("resolveConversationScope", () => {
  it("prefers programme scope when both ids are present", () => {
    expect(
      resolveConversationScope("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"),
    ).toEqual({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      spaceId: null,
    })
  })

  it("uses authority scope when only spaceId is present", () => {
    expect(resolveConversationScope(null, "22222222-2222-2222-2222-222222222222")).toEqual({
      workspaceId: null,
      spaceId: "22222222-2222-2222-2222-222222222222",
    })
  })

  it("returns null when neither scope is present", () => {
    expect(resolveConversationScope(null, null)).toBeNull()
  })
})
