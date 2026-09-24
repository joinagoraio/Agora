import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { writingLanguageName, type WritingLanguageName } from "@/lib/programme/writing-language"

export async function writingLanguageForSpace(spaceId: string | null | undefined): Promise<WritingLanguageName> {
  if (!spaceId) return "English"
  const admin = createAdminClient()
  const { data } = await admin.from("spaces").select("writing_language").eq("id", spaceId).maybeSingle()
  return writingLanguageName(data?.writing_language)
}

export async function writingLanguageForWorkspace(workspaceId: string | null | undefined): Promise<WritingLanguageName> {
  if (!workspaceId) return "English"
  const admin = createAdminClient()
  const { data } = await admin.from("workspaces").select("space_id").eq("id", workspaceId).maybeSingle()
  return writingLanguageForSpace(data?.space_id)
}
