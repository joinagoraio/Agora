"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  mapOutlineRow,
  mapTemplateRow,
  parseProgrammeBindings,
  summarizeTemplates,
  type OutlineEditorDraft,
  type ProgrammeOutlineNode,
  type ProgrammeTemplate,
  type ProgrammeTemplateSummary,
} from "@/lib/programme/domain"
import { getServerTranslator } from "@/lib/i18n/server"
import { HANDBOOK_SEED_NODES, HANDBOOK_TEMPLATE_META, HANDBOOK_TEMPLATE_NAME } from "@/lib/programme/handbook-seed"
import { LEEFREGIO_SEED_NODES, LEEFREGIO_TEMPLATE_META, LEEFREGIO_TEMPLATE_NAME } from "@/lib/programme/leefregio-seed"
import { programmeTemplateMetaSchema } from "@/lib/programme/structured-artefacts"

const OUTLINE_SELECT =
  "id, template_id, parent_id, title, purpose, instructions, field_specs, quality_rules, output_form, relation_hints, required, sort_order"

export async function listSpaceTemplates(spaceId: string): Promise<{
  data: ProgrammeTemplateSummary[]
  error?: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_templates")
    .select("id, space_id, name, quality_rules, output_form, created_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true })
  if (error) return { error: error.message, data: [] }
  const templates = (data || []).map(mapTemplateRow)
  if (templates.length === 0) return { data: [] }

  const { data: nodes, error: nodesError } = await supabase
    .from("programme_outline_nodes")
    .select("template_id, title, required, sort_order")
    .in(
      "template_id",
      templates.map((template) => template.id),
    )
    .order("sort_order", { ascending: true })
  if (nodesError) return { error: nodesError.message, data: [] }

  return {
    data: summarizeTemplates(
      templates,
      (nodes || []).map((node) => ({
        templateId: node.template_id,
        title: node.title,
        required: Boolean(node.required),
        sortOrder: node.sort_order,
      })),
    ),
  }
}

export async function getTemplateWithNodes(templateId: string): Promise<{
  data: { template: ProgrammeTemplate; nodes: ProgrammeOutlineNode[] } | null
  error?: string
}> {
  const supabase = await createClient()
  const { data: template, error } = await supabase
    .from("programme_templates")
    .select("id, space_id, name, quality_rules, output_form, created_at")
    .eq("id", templateId)
    .maybeSingle()
  if (error || !template) return { error: error?.message || "Template not found", data: null }

  const nodes = await listOutlineNodesForTemplate(templateId)
  if (nodes.error) return { error: nodes.error, data: null }
  return { data: { template: mapTemplateRow(template), nodes: nodes.data } }
}

export async function listOutlineNodesForTemplate(templateId: string): Promise<{
  data: ProgrammeOutlineNode[]
  error?: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_outline_nodes")
    .select(OUTLINE_SELECT)
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
  if (error) return { error: error.message, data: [] }
  return { data: (data || []).map(mapOutlineRow) }
}

export async function createProgrammeTemplate(input: {
  spaceId: string
  name: string
  qualityRules?: string | null
  outputForm?: string | null
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const parsed = programmeTemplateMetaSchema.safeParse({
    name: input.name,
    qualityRules: input.qualityRules,
    outputForm: input.outputForm,
  })
  if (!parsed.success) return { error: parsed.error.errors.map((e) => e.message).join("; ") }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_templates")
    .insert({
      space_id: input.spaceId,
      name: parsed.data.name,
      quality_rules: parsed.data.qualityRules ?? null,
      output_form: parsed.data.outputForm ?? null,
    })
    .select("id, space_id, name, quality_rules, output_form, created_at")
    .single()
  if (error || !data) return { error: error?.message || "Failed to create template" }
  revalidatePath(`/spaces/${input.spaceId}`)
  return { data: mapTemplateRow(data) }
}

export async function updateProgrammeTemplate(input: {
  spaceId: string
  templateId: string
  name?: string
  qualityRules?: string | null
  outputForm?: string | null
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.qualityRules !== undefined) patch.quality_rules = input.qualityRules
  if (input.outputForm !== undefined) patch.output_form = input.outputForm

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_templates")
    .update(patch)
    .eq("id", input.templateId)
    .eq("space_id", input.spaceId)
    .select("id, space_id, name, quality_rules, output_form, created_at")
    .single()
  if (error || !data) return { error: error?.message || "Failed to update template" }
  revalidatePath(`/spaces/${input.spaceId}`)
  return { data: mapTemplateRow(data) }
}

export async function deleteProgrammeTemplate(spaceId: string, templateId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { error } = await supabase.from("programme_templates").delete().eq("id", templateId).eq("space_id", spaceId)
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { data: true }
}

export async function upsertOutlineNode(input: {
  spaceId: string
  templateId: string
  nodeId?: string
  title: string
  purpose?: string | null
  instructions?: string | null
  fieldSpecs?: ProgrammeOutlineNode["fieldSpecs"]
  qualityRules?: string | null
  outputForm?: string | null
  relationHints?: string | null
  required?: boolean
  sortOrder?: number
  parentId?: string | null
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const row = {
    title: input.title.trim(),
    purpose: input.purpose ?? null,
    instructions: input.instructions ?? null,
    field_specs: input.fieldSpecs ?? [],
    quality_rules: input.qualityRules ?? null,
    output_form: input.outputForm ?? null,
    relation_hints: input.relationHints ?? null,
    required: input.required ?? true,
    sort_order: input.sortOrder ?? 1,
    parent_id: input.parentId ?? null,
  }
  if (!row.title) return { error: "Title is required" }

  const supabase = await createClient()
  if (input.nodeId) {
    const { data, error } = await supabase
      .from("programme_outline_nodes")
      .update(row)
      .eq("id", input.nodeId)
      .eq("template_id", input.templateId)
      .select(OUTLINE_SELECT)
      .single()
    if (error || !data) return { error: error?.message || "Update failed" }
    return { data: mapOutlineRow(data) }
  }

  const { data, error } = await supabase
    .from("programme_outline_nodes")
    .insert({ ...row, template_id: input.templateId })
    .select(OUTLINE_SELECT)
    .single()
  if (error || !data) return { error: error?.message || "Insert failed" }
  revalidatePath(`/spaces/${input.spaceId}`)
  return { data: mapOutlineRow(data) }
}

export async function deleteOutlineNode(spaceId: string, templateId: string, nodeId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from("programme_outline_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("template_id", templateId)
  if (error) return { error: error.message }
  return { data: true }
}

export async function syncOutlineTree(input: {
  spaceId: string
  templateId: string
  drafts: OutlineEditorDraft[]
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
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
  const keptIds = new Set<string>()

  for (const draft of input.drafts) {
    const title = draft.title.trim()
    if (!title) continue
    const payload = {
      title,
      purpose: draft.purpose?.trim() || null,
      instructions: draft.instructions?.trim() || null,
      field_specs: draft.fieldSpecs ?? [],
      quality_rules: draft.qualityRules?.trim() || null,
      output_form: draft.outputForm?.trim() || null,
      relation_hints: draft.relationHints?.trim() || null,
      required: draft.required ?? true,
      sort_order: draft.sortOrder,
      parent_id: null,
    }
    if (draft.id && existingIds.has(draft.id)) {
      const { error } = await supabase
        .from("programme_outline_nodes")
        .update(payload)
        .eq("id", draft.id)
        .eq("template_id", input.templateId)
      if (error) return { error: error.message }
      keptIds.add(draft.id)
    } else {
      const { data, error } = await supabase
        .from("programme_outline_nodes")
        .insert({ ...payload, template_id: input.templateId })
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

  return listOutlineNodesForTemplate(input.templateId)
}

export async function cloneProgrammeTemplate(spaceId: string, templateId: string, name?: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const source = await getTemplateWithNodes(templateId)
  if (source.error || !source.data) return { error: source.error || "Template not found" }

  const created = await createProgrammeTemplate({
    spaceId,
    name: name?.trim() || `${source.data.template.name} (copy)`,
    qualityRules: source.data.template.qualityRules,
    outputForm: source.data.template.outputForm,
  })
  if (created.error || !created.data) return { error: created.error || "Clone failed" }

  const idMap = new Map<string, string>()
  const ordered = [...source.data.nodes].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const node of ordered) {
    const inserted = await upsertOutlineNode({
      spaceId,
      templateId: created.data.id,
      title: node.title,
      purpose: node.purpose,
      instructions: node.instructions,
      fieldSpecs: node.fieldSpecs,
      qualityRules: node.qualityRules,
      outputForm: node.outputForm,
      relationHints: node.relationHints,
      required: node.required,
      sortOrder: node.sortOrder,
      parentId: node.parentId ? idMap.get(node.parentId) ?? null : null,
    })
    if (inserted.error || !inserted.data) return { error: inserted.error || "Clone node failed" }
    idMap.set(node.id, inserted.data.id)
  }

  const cloned = await getTemplateWithNodes(created.data.id)
  if (cloned.error || !cloned.data) return { error: cloned.error || "Clone failed" }
  revalidatePath(`/spaces/${spaceId}`)
  return { data: cloned.data }
}

export async function reorderOutlineNodes(spaceId: string, templateId: string, orderedIds: string[]) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("programme_outline_nodes")
      .update({ sort_order: i + 1 })
      .eq("id", orderedIds[i])
      .eq("template_id", templateId)
    if (error) return { error: error.message }
  }

  const nodes = await listOutlineNodesForTemplate(templateId)
  revalidatePath(`/spaces/${spaceId}`)
  return { data: nodes.data }
}

export async function saveProgrammeAsTemplate(input: { workspaceId: string; name: string }) {
  const { t } = await getServerTranslator()
  const supabase = await createClient()
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, space_id, metadata")
    .eq("id", input.workspaceId)
    .single()
  if (workspaceError || !workspace) {
    return { error: workspaceError?.message || t("workspace.programme.saveAsTemplateNeedOutline") }
  }

  try {
    await requireAuthAndPermission("space:update", { spaceId: workspace.space_id })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const bindings = parseProgrammeBindings(workspace.metadata as Record<string, unknown>)
  if (!bindings.templateId) {
    return { error: t("workspace.programme.saveAsTemplateNeedOutline") }
  }

  const { data: template, error: templateError } = await supabase
    .from("programme_templates")
    .select("id, space_id")
    .eq("id", bindings.templateId)
    .maybeSingle()
  if (templateError || !template || template.space_id !== workspace.space_id) {
    return { error: templateError?.message || t("workspace.programme.saveAsTemplateNeedOutline") }
  }

  const name = input.name.trim()
  if (!name) {
    return { error: t("workspace.programme.saveAsTemplateNameRequired") }
  }

  const cloned = await cloneProgrammeTemplate(workspace.space_id, template.id, name)
  if (cloned.error || !cloned.data) return { error: cloned.error || t("space.settings.templates.saveError") }
  revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  return { data: cloned.data }
}

/** Idempotent handbook-shaped default. Second call returns the existing row. */
export async function seedHandbookTemplateIfNone(spaceId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("programme_templates")
    .select("id, space_id, name, quality_rules, output_form, created_at")
    .eq("space_id", spaceId)
    .eq("name", HANDBOOK_TEMPLATE_NAME)
    .maybeSingle()

  if (existing) {
    const nodes = await listOutlineNodesForTemplate(existing.id)
    return { data: { template: mapTemplateRow(existing), nodes: nodes.data, created: false } }
  }

  const created = await createProgrammeTemplate({
    spaceId,
    name: HANDBOOK_TEMPLATE_NAME,
    qualityRules: HANDBOOK_TEMPLATE_META.qualityRules,
    outputForm: HANDBOOK_TEMPLATE_META.outputForm,
  })
  if (created.error || !created.data) return { error: created.error || "Seed failed" }

  for (const node of HANDBOOK_SEED_NODES) {
    const inserted = await upsertOutlineNode({
      spaceId,
      templateId: created.data.id,
      title: node.title,
      purpose: node.purpose,
      instructions: node.instructions,
      fieldSpecs: node.fieldSpecs,
      qualityRules: node.qualityRules,
      outputForm: node.outputForm,
      relationHints: node.relationHints,
      required: node.required,
      sortOrder: node.sortOrder,
    })
    if (inserted.error) return { error: inserted.error }
  }

  const nodes = await listOutlineNodesForTemplate(created.data.id)
  return { data: { template: created.data, nodes: nodes.data, created: true } }
}

export async function seedLeefregioTemplateIfNone(spaceId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("programme_templates")
    .select("id, space_id, name, quality_rules, output_form, created_at")
    .eq("space_id", spaceId)
    .eq("name", LEEFREGIO_TEMPLATE_NAME)
    .maybeSingle()

  if (existing) {
    const nodes = await listOutlineNodesForTemplate(existing.id)
    for (const spec of LEEFREGIO_SEED_NODES) {
      const current = nodes.data.find((node) => node.title === spec.title)
      if (!current) continue
      const same =
        current.instructions === spec.instructions &&
        current.purpose === spec.purpose &&
        current.qualityRules === spec.qualityRules &&
        current.relationHints === spec.relationHints
      if (same) continue
      const updated = await upsertOutlineNode({
        spaceId,
        templateId: existing.id,
        nodeId: current.id,
        title: spec.title,
        purpose: spec.purpose,
        instructions: spec.instructions,
        fieldSpecs: spec.fieldSpecs,
        qualityRules: spec.qualityRules,
        outputForm: spec.outputForm,
        relationHints: spec.relationHints,
        required: spec.required,
        sortOrder: spec.sortOrder,
      })
      if (updated.error) return { error: updated.error }
    }
    const refreshed = await listOutlineNodesForTemplate(existing.id)
    return { data: { template: mapTemplateRow(existing), nodes: refreshed.data, created: false } }
  }

  const created = await createProgrammeTemplate({
    spaceId,
    name: LEEFREGIO_TEMPLATE_NAME,
    qualityRules: LEEFREGIO_TEMPLATE_META.qualityRules,
    outputForm: LEEFREGIO_TEMPLATE_META.outputForm,
  })
  if (created.error || !created.data) return { error: created.error || "Seed failed" }

  for (const node of LEEFREGIO_SEED_NODES) {
    const inserted = await upsertOutlineNode({
      spaceId,
      templateId: created.data.id,
      title: node.title,
      purpose: node.purpose,
      instructions: node.instructions,
      fieldSpecs: node.fieldSpecs,
      qualityRules: node.qualityRules,
      outputForm: node.outputForm,
      relationHints: node.relationHints,
      required: node.required,
      sortOrder: node.sortOrder,
    })
    if (inserted.error) return { error: inserted.error }
  }

  const nodes = await listOutlineNodesForTemplate(created.data.id)
  return { data: { template: created.data, nodes: nodes.data, created: true } }
}

/** Default standard outline is the Sterke Leefregio's casus. Handbook remains an extra template. */
export async function createDefaultProgrammeTemplate(spaceId: string) {
  await seedHandbookTemplateIfNone(spaceId)
  const result = await seedLeefregioTemplateIfNone(spaceId)
  if (result.error || !result.data) return { error: result.error || "Failed" }
  return { data: result.data.template }
}
