"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { createClient } from "@/lib/supabase/server"
import { createSpace, deleteSpace, updateSpace, updateSpaceScope } from "@/lib/actions/space"
import { createWorkspace } from "@/lib/actions/workspace"
import { createProgrammeTemplate, upsertOutlineNode } from "@/lib/actions/template"
import { publishSpaceItem } from "@/lib/actions/space-item"
import { loadFlevolandDemoFiles } from "@/lib/programme/flevoland-demo-files"
import { LEEFREGIO_SEED_NODES } from "@/lib/programme/leefregio-seed"
import type { DocumentRole } from "@/lib/programme/domain"
import { revalidatePath } from "next/cache"
import { isAllowedForAgoraKeyOrgs, usesAgoraPlatformKeys } from "@/lib/llm/catalog"
import { getTenantLlmPolicies } from "@/lib/llm/resolve"

export type DemoPackChapter = {
  title: string
  purpose?: string
  instructions?: string
  required?: boolean
  sortOrder?: number
}

export type DemoPackFile = {
  title: string
  text: string
  role: DocumentRole
}

export type DemoPackModelChoice = {
  id: string
  label: string
  providerLabel: string
}

export type DemoPack = {
  id: string
  name: string
  writingLanguage: "en" | "nl"
  mission: string
  description: string
  jurisdiction: string
  defaultModelId: string
  chapters: DemoPackChapter[]
  files: DemoPackFile[]
}

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return { error: "Unauthorized" as const }
  return { user }
}

function asChapters(value: unknown): DemoPackChapter[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (typeof row.title !== "string" || !row.title.trim()) return []
    return [
      {
        title: row.title,
        purpose: typeof row.purpose === "string" ? row.purpose : "",
        instructions: typeof row.instructions === "string" ? row.instructions : "",
        required: row.required !== false,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : undefined,
      },
    ]
  })
}

function asFiles(value: unknown): DemoPackFile[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (typeof row.title !== "string" || typeof row.text !== "string" || typeof row.role !== "string") return []
    return [{ title: row.title, text: row.text, role: row.role as DocumentRole }]
  })
}

function mapPack(row: {
  id: string
  name: string
  writing_language: string
  mission?: string | null
  description?: string | null
  jurisdiction?: string | null
  default_model_id?: string | null
  chapters: unknown
  files: unknown
}): DemoPack {
  return {
    id: row.id,
    name: row.name,
    writingLanguage: row.writing_language === "nl" ? "nl" : "en",
    mission: row.mission?.trim() || "",
    description: row.description?.trim() || "",
    jurisdiction: row.jurisdiction?.trim() || "",
    defaultModelId: row.default_model_id || "",
    chapters: asChapters(row.chapters),
    files: asFiles(row.files),
  }
}

const FLEVOLAND_PACK_NAME = "Flevoland demo"

const FLEVOLAND_PROFILE = {
  mission: "Samen werken aan Flevoland in balans.",
  description:
    "Provincie Flevoland stuurt op de fysieke leefomgeving tot 2050. De ontwerp-omgevingsvisie werkt dat uit in drie strategieën: sterke leefregio's, innovatieve economische ecosystemen en een robuust polderraamwerk.",
  jurisdiction: "Provincie Flevoland",
}

export async function ensureFlevolandDemoPack() {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("platform_demo_packs")
    .select("id")
    .eq("name", FLEVOLAND_PACK_NAME)
    .maybeSingle()
  if (existing) {
    const { data: row } = await admin
      .from("platform_demo_packs")
      .select("mission")
      .eq("id", existing.id)
      .maybeSingle()
    if (!row?.mission?.trim()) {
      await admin.from("platform_demo_packs").update(FLEVOLAND_PROFILE).eq("id", existing.id)
    }
    return
  }
  await admin.from("platform_demo_packs").insert({
    name: FLEVOLAND_PACK_NAME,
    writing_language: "nl",
    ...FLEVOLAND_PROFILE,
    chapters: LEEFREGIO_SEED_NODES.map((node) => ({
      title: node.title,
      purpose: node.purpose,
      instructions: node.instructions,
      required: node.required,
      sortOrder: node.sortOrder,
    })),
    files: loadFlevolandDemoFiles(),
  })
}

export async function listDemoPacks() {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error, data: [] as DemoPack[] }
  await ensureFlevolandDemoPack()
  const admin = createAdminClient()
  const { data, error } = await admin.from("platform_demo_packs").select("*").order("name")
  if (error) return { error: error.message, data: [] as DemoPack[] }
  return { data: (data || []).map(mapPack) }
}

export async function saveDemoPack(pack: DemoPack) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error }
  const admin = createAdminClient()
  const row = {
    name: pack.name.trim(),
    writing_language: pack.writingLanguage,
    mission: pack.mission.trim() || null,
    description: pack.description.trim() || null,
    jurisdiction: pack.jurisdiction.trim() || null,
    default_model_id: pack.defaultModelId.trim() || null,
    chapters: pack.chapters,
    files: pack.files,
    updated_at: new Date().toISOString(),
  }
  if (!row.name) return { error: "Name the pack." }
  if (pack.id) {
    const { error } = await admin.from("platform_demo_packs").update(row).eq("id", pack.id)
    if (error) return { error: error.message }
    return { data: { id: pack.id } }
  }
  const { data, error } = await admin.from("platform_demo_packs").insert(row).select("id").single()
  if (error || !data) return { error: error?.message || "Could not create the pack" }
  return { data: { id: data.id as string } }
}

export async function deleteDemoPack(packId: string) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error }
  const removed = await removeLoadedDemos(packId)
  if (removed.error) return removed
  const admin = createAdminClient()
  const { error } = await admin.from("platform_demo_packs").delete().eq("id", packId)
  if (error) return { error: error.message }
  return { data: { id: packId } }
}

export async function removeLoadedDemos(packId: string) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { data: spaces, error } = await admin.from("spaces").select("id, metadata")
  if (error) return { error: error.message }
  const matches = (spaces || []).filter((space) => {
    const metadata = (space.metadata || {}) as Record<string, unknown>
    return metadata.demoPackId === packId
  })
  for (const space of matches) {
    const deleted = await deleteSpace(space.id)
    if (deleted.error) return { error: deleted.error }
  }
  return { data: { removed: matches.length } }
}

export async function listDemoPackModels() {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error, data: [] as DemoPackModelChoice[] }
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const policies = membership?.tenant_id ? await getTenantLlmPolicies(membership.tenant_id) : null
  const agoraKeys = policies ? usesAgoraPlatformKeys(policies.keyPolicy) : false
  const { data, error } = await admin
    .from("llm_models")
    .select("id, label, model_id, enabled, default_for_tenants, sort_order, llm_providers(label)")
    .eq("enabled", true)
    .order("sort_order")
  if (error) return { error: error.message, data: [] as DemoPackModelChoice[] }
  const choices = (data || []).flatMap((row) => {
    if (agoraKeys && !isAllowedForAgoraKeyOrgs(row)) return []
    const provider = Array.isArray(row.llm_providers) ? row.llm_providers[0] : row.llm_providers
    const providerLabel = provider && typeof provider === "object" && "label" in provider ? String(provider.label) : ""
    return [
      {
        id: row.id as string,
        label: (row.label as string) || (row.model_id as string),
        providerLabel,
      },
    ]
  })
  return { data: choices }
}

async function enablePackModel(spaceId: string, modelId: string) {
  const admin = createAdminClient()
  const { data: model, error } = await admin
    .from("llm_models")
    .select("id, provider_id, enabled, default_for_tenants")
    .eq("id", modelId)
    .maybeSingle()
  if (error || !model?.enabled || !model.provider_id) {
    return { error: error?.message || "Choose a default model that is still available." }
  }
  const { data: space } = await admin.from("spaces").select("tenant_id").eq("id", spaceId).maybeSingle()
  if (!space?.tenant_id) return { error: "Authority not found" }
  const now = new Date().toISOString()
  const { accessPolicy, keyPolicy } = await getTenantLlmPolicies(space.tenant_id)
  if (usesAgoraPlatformKeys(keyPolicy) && !isAllowedForAgoraKeyOrgs(model)) {
    return { error: "That model is not allowed for this organisation." }
  }
  const spaceProvider = await admin.from("space_llm_provider_settings").upsert(
    { space_id: spaceId, provider_id: model.provider_id, enabled: true, updated_at: now },
    { onConflict: "space_id,provider_id" },
  )
  if (spaceProvider.error) return { error: spaceProvider.error.message }
  const spaceModel = await admin
    .from("space_llm_settings")
    .upsert({ space_id: spaceId, model_id: model.id, enabled: true }, { onConflict: "space_id,model_id" })
  if (spaceModel.error) return { error: spaceModel.error.message }
  if (accessPolicy === "global") {
    const tenantProvider = await admin.from("tenant_llm_provider_settings").upsert(
      { tenant_id: space.tenant_id, provider_id: model.provider_id, enabled: true, updated_at: now },
      { onConflict: "tenant_id,provider_id" },
    )
    if (tenantProvider.error) return { error: tenantProvider.error.message }
    const tenantModel = await admin
      .from("tenant_llm_settings")
      .upsert({ tenant_id: space.tenant_id, model_id: model.id, enabled: true }, { onConflict: "tenant_id,model_id" })
    if (tenantModel.error) return { error: tenantModel.error.message }
  }
  return { data: { id: model.id as string } }
}

export async function loadDemoPack(packId: string) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from("platform_demo_packs").select("*").eq("id", packId).maybeSingle()
  if (error || !row) return { error: error?.message || "Pack not found" }
  const pack = mapPack(row)
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
  const created = await createSpace(`${pack.name} ${stamp}`)
  if (created.error || !created.data) return { error: created.error || "Could not create the authority" }
  const spaceId = created.data.id as string
  const { data: space } = await admin.from("spaces").select("metadata").eq("id", spaceId).maybeSingle()
  const metadata = {
    ...((space?.metadata as Record<string, unknown>) || {}),
    demo: true,
    demoPackId: pack.id,
    setupWizard: {
      completed: true,
      dismissed: true,
      completed_at: new Date().toISOString(),
    },
  }
  const updated = await updateSpace(spaceId, {
    writing_language: pack.writingLanguage,
    jurisdiction: pack.jurisdiction.trim() ? { label: pack.jurisdiction.trim() } : {},
    metadata,
  })
  if (updated.error) return { error: updated.error }
  const scope = await updateSpaceScope(spaceId, {
    summary: pack.mission.trim() || null,
    description: pack.description.trim() || null,
  })
  if (scope.error) return { error: scope.error }

  if (pack.defaultModelId) {
    const enabled = await enablePackModel(spaceId, pack.defaultModelId)
    if (enabled.error) return { error: enabled.error }
  }

  const template = await createProgrammeTemplate({
    spaceId,
    name: pack.name,
  })
  if (template.error || !template.data) return { error: template.error || "Could not save the chapter structure" }
  for (const [index, chapter] of pack.chapters.entries()) {
    const node = await upsertOutlineNode({
      spaceId,
      templateId: template.data.id,
      title: chapter.title,
      purpose: chapter.purpose,
      instructions: chapter.instructions,
      required: chapter.required !== false,
      sortOrder: chapter.sortOrder ?? index + 1,
    })
    if (node.error) return { error: node.error }
  }

  for (const file of pack.files) {
    const published = await publishSpaceItem(spaceId, {
      item_type: "document",
      classification: "public",
      payload: { title: file.title, full_text: file.text, summary: file.text.slice(0, 240) },
    })
    if (published.error) return { error: published.error }
  }

  const workspace = await createWorkspace(spaceId, pack.name, undefined, "environmental_programme", {
    templateId: template.data.id,
  })
  if (workspace.error || !workspace.data) return { error: workspace.error || "Could not create the programme" }

  const { ensureDefaultAgentsBound } = await import("@/lib/actions/programme")
  const agents = await ensureDefaultAgentsBound(workspace.data.id, spaceId, {
    catalogModelId: pack.defaultModelId || null,
  })
  if (agents.error) return { error: agents.error }

  const { data: documents } = await admin
    .from("documents")
    .select("id, title")
    .eq("workspace_id", workspace.data.id)
  for (const file of pack.files) {
    const match = (documents || []).find((doc) => doc.title === file.title)
    if (!match) continue
    const { bindProgrammeDocumentRole } = await import("@/lib/actions/programme")
    const bound = await bindProgrammeDocumentRole(workspace.data.id, match.id, file.role)
    if (bound.error) return { error: bound.error }
  }

  revalidatePath("/dashboard")
  revalidatePath("/admin/demo-packs")
  return { data: { spaceId, workspaceId: workspace.data.id as string } }
}
