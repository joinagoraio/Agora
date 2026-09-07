"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  parseProgrammeBindings,
  type OutlineEditorDraft,
  type ProgrammeOutlineNode,
} from "@/lib/programme/domain"
import { createDefaultProgrammeTemplate, listOutlineNodesForTemplate } from "@/lib/actions/template"
import { updateProgrammeBindings } from "@/lib/actions/programme"

export async function listProgrammeOutlineNodes(templateId: string): Promise<{
  data: ProgrammeOutlineNode[]
  error?: string
}> {
  return listOutlineNodesForTemplate(templateId)
}

/** Ensure space has a default template and bind it on the workspace. */
export async function ensureProgrammeOutline(workspaceId: string, spaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("metadata")
    .eq("id", workspaceId)
    .single()
  if (wsError || !workspace) return { error: wsError?.message || "Workspace not found" }

  const bindings = parseProgrammeBindings(workspace.metadata as Record<string, unknown>)
  if (bindings.templateId) {
    const { data: existing } = await supabase
      .from("programme_templates")
      .select("id")
      .eq("id", bindings.templateId)
      .maybeSingle()
    if (existing) {
      const nodes = await listProgrammeOutlineNodes(bindings.templateId)
      return { data: { templateId: bindings.templateId, nodes: nodes.data } }
    }
  }

  const seeded = await createDefaultProgrammeTemplate(spaceId)
  if (seeded.error || !seeded.data) return { error: seeded.error || "Failed to create template" }

  const nextBindings = { ...bindings, templateId: seeded.data.id }
  const saved = await updateProgrammeBindings(workspaceId, nextBindings)
  if (saved.error) return { error: saved.error }

  const nodes = await listProgrammeOutlineNodes(seeded.data.id)
  return { data: { templateId: seeded.data.id, nodes: nodes.data } }
}

export async function syncProgrammeOutlineFromEditor(input: {
  workspaceId: string
  templateId: string
  drafts: OutlineEditorDraft[]
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  if (!input.drafts.length) return { error: "Outline must contain at least one section" }

  const supabase = await createClient()
  const { data: existing, error: loadError } = await supabase
    .from("programme_outline_nodes")
    .select("id")
    .eq("template_id", input.templateId)
  if (loadError) return { error: loadError.message }

  const existingIds = new Set((existing || []).map((r) => r.id))
  const existingOrdered = (existing || []).map((r) => r.id)
  const keptIds = new Set<string>()

  for (let i = 0; i < input.drafts.length; i++) {
    const draft = input.drafts[i]
    const title = draft.title.trim()
    if (!title) continue
    const purpose = draft.purpose?.trim() || null
    const sortOrder = draft.sortOrder
    const resolvedId =
      draft.id && existingIds.has(draft.id) ? draft.id : existingOrdered[i] && !keptIds.has(existingOrdered[i]) ? existingOrdered[i] : undefined

    if (resolvedId) {
      const { error } = await supabase
        .from("programme_outline_nodes")
        .update({
          title,
          purpose,
          instructions: draft.instructions ?? null,
          field_specs: draft.fieldSpecs ?? [],
          quality_rules: draft.qualityRules ?? null,
          output_form: draft.outputForm ?? null,
          relation_hints: draft.relationHints ?? null,
          required: draft.required ?? true,
          sort_order: sortOrder,
          parent_id: null,
        })
        .eq("id", resolvedId)
        .eq("template_id", input.templateId)
      if (error) return { error: error.message }
      keptIds.add(resolvedId)
    } else {
      const { data, error } = await supabase
        .from("programme_outline_nodes")
        .insert({
          template_id: input.templateId,
          title,
          purpose,
          instructions: draft.instructions ?? null,
          field_specs: draft.fieldSpecs ?? [],
          quality_rules: draft.qualityRules ?? null,
          output_form: draft.outputForm ?? null,
          relation_hints: draft.relationHints ?? null,
          required: draft.required ?? true,
          sort_order: sortOrder,
          parent_id: null,
        })
        .select("id")
        .single()
      if (error || !data) return { error: error?.message || "Insert failed" }
      keptIds.add(data.id)
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("programme_outline_nodes")
      .delete()
      .eq("template_id", input.templateId)
      .in("id", toDelete)
    if (error) return { error: error.message }
  }

  const nodes = await listProgrammeOutlineNodes(input.templateId)
  revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  return { data: nodes.data }
}

export async function reorderProgrammeOutlineNodes(input: {
  workspaceId: string
  templateId: string
  orderedIds: string[]
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await supabase
      .from("programme_outline_nodes")
      .update({ sort_order: i + 1 })
      .eq("id", input.orderedIds[i])
      .eq("template_id", input.templateId)
    if (error) return { error: error.message }
  }

  const nodes = await listProgrammeOutlineNodes(input.templateId)
  revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  return { data: nodes.data }
}

export async function updateProgrammeOutlineNode(input: {
  workspaceId: string
  templateId: string
  nodeId: string
  title?: string
  purpose?: string | null
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const title = input.title?.trim()
  if (title !== undefined && !title) return { error: "Chapter title is required" }

  const patch: Record<string, unknown> = {}
  if (title !== undefined) patch.title = title
  if (input.purpose !== undefined) patch.purpose = input.purpose?.trim() || null
  if (Object.keys(patch).length === 0) {
    const nodes = await listProgrammeOutlineNodes(input.templateId)
    return { data: nodes.data }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("programme_outline_nodes")
    .update(patch)
    .eq("id", input.nodeId)
    .eq("template_id", input.templateId)
  if (error) return { error: error.message }

  const nodes = await listProgrammeOutlineNodes(input.templateId)
  revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  return { data: nodes.data }
}

export async function insertProgrammeOutlineNode(input: {
  workspaceId: string
  templateId: string
  afterId?: string | null
  title: string
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const title = input.title.trim() || "New chapter"
  const listed = await listProgrammeOutlineNodes(input.templateId)
  if (listed.error) return { error: listed.error }
  const ordered = [...listed.data].sort((a, b) => a.sortOrder - b.sortOrder)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_outline_nodes")
    .insert({
      template_id: input.templateId,
      title,
      purpose: null,
      required: true,
      sort_order: ordered.length + 1,
      parent_id: null,
    })
    .select("id")
    .single()
  if (error || !data) return { error: error?.message || "Insert failed" }

  const afterIndex = input.afterId ? ordered.findIndex((node) => node.id === input.afterId) : ordered.length - 1
  const insertAt = Math.max(0, afterIndex + 1)
  const orderedIds = ordered.map((node) => node.id)
  orderedIds.splice(insertAt, 0, data.id)

  return reorderProgrammeOutlineNodes({
    workspaceId: input.workspaceId,
    templateId: input.templateId,
    orderedIds,
  })
}
