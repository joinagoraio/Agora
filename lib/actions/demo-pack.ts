"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { createClient } from "@/lib/supabase/server"
import { createSpace, deleteSpace, updateSpace, updateSpaceScope } from "@/lib/actions/space"
import { createWorkspace } from "@/lib/actions/workspace"
import { createProgrammeTemplate, upsertOutlineNode } from "@/lib/actions/template"
import { publishSpaceItem } from "@/lib/actions/space-item"
import {
  FLEVOLAND_DEFAULT_MODEL_ID,
  FLEVOLAND_EARLIER_MEASURE_OUTPUT_FORMS,
  FLEVOLAND_FOCUS_INTERESTS,
  FLEVOLAND_MEASURE_OUTPUT_FORM,
  FLEVOLAND_PROGRAMME_CHAPTERS,
  FLEVOLAND_WORKUP_HEADINGS,
} from "@/lib/programme/flevoland-programme-seed"
import {
  DEMO_PACK_SPACE_TYPES,
  parseChapterInputs,
  type ChapterInput,
  type DemoPackSpaceType,
  type DocumentRole,
} from "@/lib/programme/domain"
import { parseWorkupHeadings, type WorkupHeading } from "@/lib/programme/interests"
import { parseDemoTour, type DemoTour } from "@/lib/programme/demo-tour"
import { spaceCost } from "@/lib/llm/usage"
import { FLEVOLAND_TOUR, FLEVOLAND_TOUR_VERSION } from "@/lib/programme/flevoland-tour"
import { logger } from "@/lib/utils/logger"
import { revalidatePath } from "next/cache"
import { isAllowedForAgoraKeyOrgs, usesAgoraPlatformKeys } from "@/lib/llm/catalog"
import { getTenantLlmPolicies } from "@/lib/llm/resolve"

export type DemoPackChapter = {
  title: string
  purpose?: string
  instructions?: string
  outputForm?: string
  drawsOn?: ChapterInput[]
  required?: boolean
  sortOrder?: number
}

export type DemoPackFile = {
  title: string
  text: string
  role: DocumentRole
}

export type LoadedDemo = {
  spaceId: string
  name: string
  packId: string
  packName: string
  loadedAt: string
  programmes: number
  measures: number
  documents: number
  tour: DemoTour | null
  /** AI cost so far, in US dollars. */
  costUsd: number
}

export type DemoPackModelChoice = {
  id: string
  label: string
  providerLabel: string
}

export type { DemoPackSpaceType }

export type DemoPack = {
  id: string
  name: string
  writingLanguage: "en" | "nl"
  mission: string
  description: string
  jurisdiction: string
  spaceType: DemoPackSpaceType
  defaultModelId: string
  workupHeadings: WorkupHeading[]
  focusInterests: string[]
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
        outputForm: typeof row.outputForm === "string" ? row.outputForm : "",
        drawsOn: parseChapterInputs(row.drawsOn),
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
  space_type?: string | null
  default_model_id?: string | null
  workup_headings?: unknown
  focus_interests?: string[] | null
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
    spaceType: DEMO_PACK_SPACE_TYPES.includes(row.space_type as DemoPackSpaceType)
      ? (row.space_type as DemoPackSpaceType)
      : "municipal",
    defaultModelId: row.default_model_id || "",
    workupHeadings: parseWorkupHeadings(row.workup_headings),
    focusInterests: (row.focus_interests || []).map((value) => value.trim()).filter(Boolean),
    chapters: asChapters(row.chapters),
    files: asFiles(row.files),
  }
}

const FLEVOLAND_PACK_NAME = "Flevoland demo"

/** Chapters from the earlier strong-living-regions structure, which the nine-part structure replaces. */
const EARLIER_FLEVOLAND_CHAPTERS = new Set(["Volkshuisvestingsprogramma", "Maatregelenprogramma", "Inleiding en wettelijk kader"])

function flevolandChapters() {
  return FLEVOLAND_PROGRAMME_CHAPTERS.map((chapter) => ({ ...chapter }))
}

function usesEarlierStructure(chapters: unknown) {
  if (!Array.isArray(chapters) || chapters.length === 0) return true
  return chapters.some(
    (item) => item && typeof item === "object" && EARLIER_FLEVOLAND_CHAPTERS.has(String((item as { title?: unknown }).title)),
  )
}

const EARLIER_MEASURE_FORMS = new Set(FLEVOLAND_EARLIER_MEASURE_OUTPUT_FORMS)

function usesEarlierMeasureForm(chapters: unknown) {
  return (
    Array.isArray(chapters) &&
    chapters.some((item) => item && typeof item === "object" && EARLIER_MEASURE_FORMS.has(String((item as { outputForm?: unknown }).outputForm)))
  )
}

function withCurrentMeasureForm(chapters: unknown[]) {
  return chapters.map((item) =>
    item && typeof item === "object" && EARLIER_MEASURE_FORMS.has(String((item as { outputForm?: unknown }).outputForm))
      ? { ...(item as Record<string, unknown>), outputForm: FLEVOLAND_MEASURE_OUTPUT_FORM }
      : item,
  )
}

async function catalogModelId(admin: ReturnType<typeof createAdminClient>, modelId: string) {
  const { data } = await admin.from("llm_models").select("id").eq("model_id", modelId).eq("enabled", true).limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

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
      .select("mission, chapters, space_type, default_model_id, workup_headings, focus_interests, tour")
      .eq("id", existing.id)
      .maybeSingle()
    const patch: Record<string, unknown> = {}
    if (!row?.mission?.trim()) Object.assign(patch, FLEVOLAND_PROFILE)
    if (usesEarlierStructure(row?.chapters)) patch.chapters = flevolandChapters()
    else if (usesEarlierMeasureForm(row?.chapters)) patch.chapters = withCurrentMeasureForm(row?.chapters as unknown[])
    if (!row?.space_type) patch.space_type = "regional"
    if (parseWorkupHeadings(row?.workup_headings).length === 0) patch.workup_headings = FLEVOLAND_WORKUP_HEADINGS
    if (!row?.focus_interests?.length) patch.focus_interests = FLEVOLAND_FOCUS_INTERESTS
    if ((parseDemoTour(row?.tour)?.version ?? 0) < FLEVOLAND_TOUR_VERSION) patch.tour = FLEVOLAND_TOUR
    if (!row?.default_model_id) {
      const modelId = await catalogModelId(admin, FLEVOLAND_DEFAULT_MODEL_ID)
      if (modelId) patch.default_model_id = modelId
    }
    if (Object.keys(patch).length === 0) return
    await admin
      .from("platform_demo_packs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
    return
  }
  await admin.from("platform_demo_packs").insert({
    name: FLEVOLAND_PACK_NAME,
    writing_language: "nl",
    ...FLEVOLAND_PROFILE,
    space_type: "regional",
    default_model_id: await catalogModelId(admin, FLEVOLAND_DEFAULT_MODEL_ID),
    workup_headings: FLEVOLAND_WORKUP_HEADINGS,
    focus_interests: FLEVOLAND_FOCUS_INTERESTS,
    chapters: flevolandChapters(),
    tour: FLEVOLAND_TOUR,
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
    space_type: pack.spaceType,
    default_model_id: pack.defaultModelId.trim() || null,
    workup_headings: parseWorkupHeadings(pack.workupHeadings),
    focus_interests: pack.focusInterests.map((value) => value.trim()).filter(Boolean),
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

/** Every authority loaded from a pack, with what ending it would delete. */
export async function listLoadedDemos(packId?: string) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error, data: [] as LoadedDemo[] }
  const admin = createAdminClient()
  const { data: spaces, error } = await admin.from("spaces").select("id, name, metadata, created_at")
  if (error) return { error: error.message, data: [] as LoadedDemo[] }
  const demos = (spaces || []).filter((space) => {
    const metadata = (space.metadata || {}) as Record<string, unknown>
    return metadata.demo === true && typeof metadata.demoPackId === "string" && (!packId || metadata.demoPackId === packId)
  })
  const result: LoadedDemo[] = []
  for (const space of demos) result.push(await describeLoadedDemo(admin, space))
  return { data: result.sort((a, b) => b.loadedAt.localeCompare(a.loadedAt)) }
}

/** The demo this authority was loaded from, for platform admins only; null otherwise. */
export async function getLoadedDemo(spaceId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return { data: null }
  const admin = createAdminClient()
  const { data: space } = await admin.from("spaces").select("id, name, metadata, created_at").eq("id", spaceId).maybeSingle()
  const metadata = ((space?.metadata as Record<string, unknown> | null) || {}) as Record<string, unknown>
  if (!space || metadata.demo !== true || typeof metadata.demoPackId !== "string") return { data: null }
  await ensureFlevolandDemoPack()
  return { data: await describeLoadedDemo(admin, space) }
}

async function describeLoadedDemo(
  admin: ReturnType<typeof createAdminClient>,
  space: { id: string; name: string; metadata: unknown; created_at?: string | null },
): Promise<LoadedDemo> {
  const metadata = ((space.metadata as Record<string, unknown> | null) || {}) as Record<string, unknown>
  const { data: workspaces } = await admin.from("workspaces").select("id").eq("space_id", space.id)
  const workspaceIds = (workspaces || []).map((row) => row.id as string)
  const count = async (table: string) => {
    if (workspaceIds.length === 0) return 0
    const { count: total } = await admin.from(table).select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds)
    return total ?? 0
  }
  const [measures, documents, pack, cost] = await Promise.all([
    count("programme_measures"),
    count("documents"),
    admin.from("platform_demo_packs").select("tour").eq("id", String(metadata.demoPackId)).maybeSingle(),
    spaceCost(space.id),
  ])
  return {
    spaceId: space.id,
    name: space.name,
    packId: String(metadata.demoPackId),
    packName: typeof metadata.demoPackName === "string" ? metadata.demoPackName : space.name,
    loadedAt: typeof metadata.demoLoadedAt === "string" ? metadata.demoLoadedAt : space.created_at || "",
    programmes: workspaceIds.length,
    measures,
    documents,
    tour: parseDemoTour(pack.data?.tour),
    costUsd: cost.totalUsd,
  }
}

/** Delete one loaded demo authority and everything in it. Other demos stay. */
export async function endLoadedDemo(spaceId: string) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { data: space } = await admin.from("spaces").select("metadata").eq("id", spaceId).maybeSingle()
  const metadata = ((space?.metadata as Record<string, unknown> | null) || {}) as Record<string, unknown>
  if (!space || metadata.demo !== true || typeof metadata.demoPackId !== "string") {
    return { error: "This authority was not loaded from a demo pack, so it cannot be ended here." }
  }
  const deleted = await deleteSpace(spaceId)
  if (deleted.error) return { error: deleted.error }
  revalidatePath("/dashboard")
  revalidatePath("/admin/demo-packs")
  return { data: { spaceId } }
}

/** End this demo and load the same pack fresh; returns the new programme. */
export async function resetLoadedDemo(spaceId: string) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { data: space } = await admin.from("spaces").select("metadata").eq("id", spaceId).maybeSingle()
  const packId = ((space?.metadata as Record<string, unknown> | null) || {}).demoPackId
  if (typeof packId !== "string") return { error: "This authority was not loaded from a demo pack." }
  const loaded = await loadDemoPack(packId)
  if (loaded.error || !loaded.data) return { error: loaded.error || "Could not load a fresh demo" }
  const ended = await endLoadedDemo(spaceId)
  if (ended.error) return { error: ended.error, data: loaded.data }
  return { data: loaded.data }
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
  if (!pack.defaultModelId) return { error: "Choose a default model for this pack before loading it." }
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
  const created = await createSpace(`${pack.name} ${stamp}`, { spaceType: pack.spaceType })
  if (created.error || !created.data) return { error: created.error || "Could not create the authority" }
  const spaceId = created.data.id as string
  const built = await buildLoadedPack(pack, spaceId)
  if (built.error) {
    await deleteSpace(spaceId).catch(() => undefined)
    return { error: built.error }
  }
  revalidatePath("/dashboard")
  revalidatePath("/admin/demo-packs")
  return { data: { spaceId, workspaceId: built.workspaceId as string } }
}

async function buildLoadedPack(pack: DemoPack, spaceId: string): Promise<{ error?: string; workspaceId?: string }> {
  const admin = createAdminClient()
  const { data: space } = await admin.from("spaces").select("metadata").eq("id", spaceId).maybeSingle()
  const metadata = {
    ...((space?.metadata as Record<string, unknown>) || {}),
    demo: true,
    demoPackId: pack.id,
    demoPackName: pack.name,
    demoLoadedAt: new Date().toISOString(),
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

  const enabled = await enablePackModel(spaceId, pack.defaultModelId)
  if (enabled.error) return { error: enabled.error }

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
      outputForm: chapter.outputForm,
      drawsOn: chapter.drawsOn,
      sortOrder: chapter.sortOrder ?? index + 1,
    })
    if (node.error) return { error: node.error }
  }
  if (pack.workupHeadings.length > 0) {
    const { saveTemplateWorkupHeadings } = await import("@/lib/actions/interests")
    const headings = await saveTemplateWorkupHeadings(spaceId, template.data.id, pack.workupHeadings)
    if (headings.error) return { error: headings.error }
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

  const { findProgrammeInterests, selectProgrammeInterestsByReference } = await import("@/lib/actions/interests")
  const found = await findProgrammeInterests(workspace.data.id)
  if (found.error) {
    logger.warn("[DemoPack] Interests not found on load", { error: found.error })
  } else if (pack.focusInterests.length > 0) {
    const chosen = await selectProgrammeInterestsByReference(workspace.data.id, pack.focusInterests)
    if (chosen.error) logger.warn("[DemoPack] Focus interests not chosen", { error: chosen.error })
  }

  return { workspaceId: workspace.data.id as string }
}
