export type ConversationScope = {
  workspaceId: string | null
  spaceId: string | null
}

/** Programme scope wins when both ids are present. Exactly one side is set. */
export function resolveConversationScope(
  workspaceId?: string | null,
  spaceId?: string | null,
): ConversationScope | null {
  if (workspaceId) {
    return { workspaceId, spaceId: null }
  }
  if (spaceId) {
    return { workspaceId: null, spaceId }
  }
  return null
}
