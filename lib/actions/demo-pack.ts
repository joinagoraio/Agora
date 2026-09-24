"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { createClient } from "@/lib/supabase/server"
import { createSpace, deleteSpace, updateSpace } from "@/lib/actions/space"
import { createWorkspace } from "@/lib/actions/workspace"
import { createProgrammeTemplate, upsertOutlineNode } from "@/lib/actions/template"
import { publishSpaceItem } from "@/lib/actions/space-item"
import { loadFlevolandDemoFiles } from "@/lib/programme/flevoland-demo-files"
import { LEEFREGIO_SEED_NODES } from "@/lib/programme/leefregio-seed"
import type { DocumentRole } from "@/lib/programme/domain"
import { revalidatePath } from "next/cache"

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

export type DemoPack = {
  id: string
  name: string
  writingLanguage: "en" | "nl"
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
  chapters: unknown
  files: unknown
}): DemoPack {
  return {
    id: row.id,
    name: row.name,
    writingLanguage: row.writing_language === "nl" ? "nl" : "en",
    chapters: asChapters(row.chapters),
    files: asFiles(row.files),
  }
}

const FLEVOLAND_PACK_NAME = "Flevoland demo"

export async function ensureFlevolandDemoPack() {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("platform_demo_packs")
    .select("id")
    .eq("name", FLEVOLAND_PACK_NAME)
    .maybeSingle()
  if (existing) return
  await admin.from("platform_demo_packs").insert({
    name: FLEVOLAND_PACK_NAME,
    writing_language: "nl",
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
  }
  const updated = await updateSpace(spaceId, {
    writing_language: pack.writingLanguage,
    metadata,
  })
  if (updated.error) return { error: updated.error }

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
