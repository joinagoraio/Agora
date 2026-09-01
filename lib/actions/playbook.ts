"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { DEFAULT_DRAFT_PLAYBOOK, DEFAULT_CHAT_PLAYBOOK } from "@/lib/chat/playbook-compiler"

const SEED_ENVIRONMENTAL_PROGRAMME_PLAYBOOK = `${DEFAULT_CHAT_PLAYBOOK}

ENVIRONMENTAL PROGRAMME RULES:
- Reason from the environmental vision as the leading framework
- Distinguish ambition, goal, measure, and implementation clearly
- Prefer concrete, implementable measures over vague aspirations
- Flag environmental effects-report deviations and require justification
- Prefer the programme handbook structure for chapter placement

${DEFAULT_DRAFT_PLAYBOOK}`

export async function createPlaybookWithVersion(spaceId: string, name: string, body?: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: playbook, error } = await supabase
    .from("playbooks")
    .insert({
      space_id: spaceId,
      name,
      workspace_kind: "environmental_programme",
      created_by: user?.id,
    })
    .select()
    .single()

  if (error || !playbook) return { error: error?.message || "Failed to create playbook" }

  const { data: version, error: versionError } = await supabase
    .from("playbook_versions")
    .insert({
      playbook_id: playbook.id,
      version: 1,
      body: body ?? SEED_ENVIRONMENTAL_PROGRAMME_PLAYBOOK,
      changelog: "Initial version",
      created_by: user?.id,
    })
    .select()
    .single()

  if (versionError) return { error: versionError.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { data: { playbook, version } }
}

export async function seedDefaultEnvironmentalPlaybook(spaceId: string) {
  return createPlaybookWithVersion(spaceId, "Environmental programme — default", SEED_ENVIRONMENTAL_PROGRAMME_PLAYBOOK)
}

export async function getLatestPlaybookBody(playbookId: string): Promise<{
  body?: string
  versionId?: string
  config?: unknown
  error?: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("playbook_versions")
    .select("id, body, version, config")
    .eq("playbook_id", playbookId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return {}
  return { body: data.body, versionId: data.id, config: data.config ?? {} }
}

export async function listPlaybooks(spaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("playbooks").select("id, name, workspace_kind, created_at").eq("space_id", spaceId).order("created_at", { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}
