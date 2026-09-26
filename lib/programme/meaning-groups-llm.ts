import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/utils/logger"
import { meaningGroupsMessages, parseMeaningGroups, type MeaningGroup, type MeaningGroupKind, type MeaningItem } from "@/lib/programme/meaning-groups"

/** The language the authority writes its programmes in. */
export async function workspaceWritingLanguage(workspaceId: string): Promise<"nl" | "en"> {
  const admin = createAdminClient()
  const { data: workspace } = await admin.from("workspaces").select("space_id").eq("id", workspaceId).maybeSingle()
  if (!workspace?.space_id) return "en"
  const { data: space } = await admin.from("spaces").select("writing_language").eq("id", workspace.space_id).maybeSingle()
  return space?.writing_language === "nl" ? "nl" : "en"
}

/** Groups items that make the same point. Returns no groups when the AI is unavailable, so callers fall back. */
export async function groupByMeaning(
  kind: MeaningGroupKind,
  items: MeaningItem[],
  options: { workspaceId: string; minSize?: number },
): Promise<MeaningGroup[]> {
  if (items.length < 2) return []
  try {
    const language = await workspaceWritingLanguage(options.workspaceId)
    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const result = await completePlatformTask("summarize", {
      messages: meaningGroupsMessages(kind, language, items),
      maxTokens: 4000,
      json: true,
      usage: { workspaceId: options.workspaceId, kind: kind === "notes" ? "note_groups" : "response_groups" },
    })
    return parseMeaningGroups(
      result.text,
      items.map((item) => item.id),
      { minSize: options.minSize },
    )
  } catch (error) {
    logger.warn("[MeaningGroups] Grouping by meaning failed; falling back", { kind, error: error instanceof Error ? error.message : String(error) })
    return []
  }
}
