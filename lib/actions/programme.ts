"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getServerTranslator } from "@/lib/i18n/server"
import {
  emptyProgrammeBindings,
  parseProgrammeBindings,
  type ProgrammeBindings,
  type DocumentRole,
  isDocumentRole,
} from "@/lib/programme/domain"
import { applyDocumentRoleToBindings } from "@/lib/programme/source-set-bindings"
import { rebuildDocumentSectionsWithClient } from "@/lib/documents/rebuild-sections"
import { getUserWorkspaceRole, requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  canAdministerProgramme,
  canWriteChapter,
  parseChapterOwnerId,
  parseDocumentOwnerId,
} from "@/lib/programme/ownership"
import {
  evaluateDistinctReviewerApproval,
  parseChapterWorkflow,
  parseFillJob,
  parseFillJobRecord,
  parseProgrammePolicies,
  remainingFillNodes,
  mergeOkFillProgress,
  type ChapterWorkflowStatus,
  type FillJob,
  type ProgrammePolicies,
} from "@/lib/programme/review-policy"
import { snapshotArtefact } from "@/lib/actions/collaboration"
import { createAdminClient } from "@/lib/supabase/admin"
import { env } from "@/lib/env"

async function loadProgrammeOwnership(workspaceId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("metadata, created_by")
    .eq("id", workspaceId)
    .single()
  if (!workspace) {
    return {
      error: "Workspace not found",
      user: null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"],
      documentOwnerId: null as string | null,
      accessRole: null as string | null,
    }
  }
  const documentOwnerId = parseDocumentOwnerId(workspace.metadata) || workspace.created_by || null
  const accessRole = user ? await getUserWorkspaceRole(user.id, workspaceId) : null
  return { error: null as string | null, user, documentOwnerId, accessRole }
}

async function patchWorkspaceMetadata(workspaceId: string, patch: Record<string, unknown>) {
  const supabase = await createClient()
  const { data: workspace, error } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  if (error || !workspace) return { error: error?.message || "Workspace not found", metadata: null as Record<string, unknown> | null }
  const metadata = {
    ...((workspace.metadata as Record<string, unknown>) || {}),
    ...patch,
  }
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", workspaceId)
  if (updateError) return { error: updateError.message, metadata: null }
  return { metadata }
}

export async function updateProgrammeBindings(workspaceId: string, bindings: ProgrammeBindings) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: workspace, error: loadError } = await supabase
    .from("workspaces")
    .select("id, metadata, kind")
    .eq("id", workspaceId)
    .single()

  if (loadError || !workspace) return { error: "Workspace not found" }

  const metadata = {
    ...((workspace.metadata as Record<string, unknown>) || {}),
    kind: workspace.kind || "environmental_programme",
    programmeBindings: bindings,
  }

  const { error } = await supabase
    .from("workspaces")
    .update({
      kind: "environmental_programme",
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId)

  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${workspaceId}`)
  return { data: bindings }
}

export async function bindWorkspaceTemplate(workspaceId: string, templateId: string) {
  const supabase = await createClient()
  const { t } = await getServerTranslator()
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("space_id, metadata")
    .eq("id", workspaceId)
    .single()
  if (error || !workspace) {
    return { error: error?.message || t("space.workspaces.dialog.templateInvalid"), data: emptyProgrammeBindings() }
  }

  const { data: template, error: templateError } = await supabase
    .from("programme_templates")
    .select("id, space_id")
    .eq("id", templateId)
    .maybeSingle()
  if (templateError || !template || template.space_id !== workspace.space_id) {
    return {
      error: templateError?.message || t("space.workspaces.dialog.templateInvalid"),
      data: emptyProgrammeBindings(),
    }
  }

  const current = parseProgrammeBindings(workspace.metadata as Record<string, unknown>)
  return updateProgrammeBindings(workspaceId, { ...current, templateId })
}

export async function bindWorkspaceChapterAgent(
  workspaceId: string,
  outlineNodeId: string,
  agentId: string | null,
) {
  const current = await getProgrammeBindings(workspaceId)
  if (current.error) return current
  const chapterAgentBindings = { ...(current.data.chapterAgentBindings || {}) }
  if (agentId) chapterAgentBindings[outlineNodeId] = agentId
  else delete chapterAgentBindings[outlineNodeId]
  return updateProgrammeBindings(workspaceId, {
    ...current.data,
    chapterAgentBindings,
  })
}

export async function bindWorkspaceAgents(
  workspaceId: string,
  agentBindings: ProgrammeBindings["agentBindings"],
) {
  const current = await getProgrammeBindings(workspaceId)
  if (current.error) return current
  return updateProgrammeBindings(workspaceId, {
    ...current.data,
    agentBindings: { ...(current.data.agentBindings || {}), ...(agentBindings || {}) },
  })
}

export async function getProgrammeBindings(workspaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  if (error || !data) return { error: error?.message || "Not found", data: emptyProgrammeBindings() }
  return { data: parseProgrammeBindings(data.metadata as Record<string, unknown>) }
}

export async function getProgrammePolicies(workspaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("workspaces").select("metadata, created_by").eq("id", workspaceId).single()
  if (error || !data) {
    return {
      error: error?.message || "Not found",
      data: {
        distinctReviewer: false,
        stakeholderExportRequiresFreeze: false,
        hasFreeze: false,
        freezeId: null as string | null,
        freezeAt: null as string | null,
        fillJob: null as FillJob | null,
        documentOwnerId: null as string | null,
        accessRole: null as string | null,
      },
    }
  }
  let documentOwnerId = parseDocumentOwnerId(data.metadata)
  if (!documentOwnerId && data.created_by) {
    documentOwnerId = data.created_by
    await patchWorkspaceMetadata(workspaceId, { documentOwnerId })
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const accessRole = user ? await getUserWorkspaceRole(user.id, workspaceId) : null
  const { data: freeze } = await supabase
    .from("programme_freezes")
    .select("id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return {
    data: {
      ...parseProgrammePolicies(data.metadata),
      hasFreeze: Boolean(freeze),
      freezeId: freeze?.id ?? null,
      freezeAt: freeze?.created_at ?? null,
      fillJob: (await loadLatestFillJob(workspaceId)) || parseFillJob(data.metadata),
      documentOwnerId,
      accessRole,
    },
  }
}

export async function assignDocumentOwner(workspaceId: string, ownerId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const ownership = await loadProgrammeOwnership(workspaceId)
  if (ownership.error) return { error: ownership.error }
  if (
    !canAdministerProgramme({
      actorId: ownership.user?.id,
      accessRole: ownership.accessRole,
      documentOwnerId: ownership.documentOwnerId,
    })
  ) {
    return { error: "Only the document owner can assign the document owner" }
  }
  const saved = await patchWorkspaceMetadata(workspaceId, { documentOwnerId: ownerId })
  if (saved.error) return { error: saved.error }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { documentOwnerId: ownerId } }
}

export async function updateProgrammePolicies(workspaceId: string, patch: Partial<ProgrammePolicies>) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const current = await getProgrammePolicies(workspaceId)
  const next: ProgrammePolicies = {
    distinctReviewer: patch.distinctReviewer ?? current.data.distinctReviewer,
    stakeholderExportRequiresFreeze: patch.stakeholderExportRequiresFreeze ?? current.data.stakeholderExportRequiresFreeze,
  }
  const saved = await patchWorkspaceMetadata(workspaceId, next)
  if (saved.error) return { error: saved.error }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { ...current.data, ...next } }
}

export async function approveAllProgrammeLocally(workspaceId: string) {
  const policy = await updateProgrammePolicies(workspaceId, { distinctReviewer: false })
  if (policy.error) return { error: policy.error }

  const { listProgrammeMeasures, setMeasureWorkflowStatus, approveProgrammeMeasure } = await import(
    "@/lib/actions/measures"
  )
  const listed = await listProgrammeMeasures(workspaceId)
  if (listed.error) return { error: listed.error }

  const measures: Array<{ title: string; status: string; error?: string }> = []
  for (const measure of listed.data) {
    if (measure.workflow_status === "approved") {
      measures.push({ title: measure.title, status: "already_approved" })
      continue
    }
    if (measure.workflow_status === "generated" || measure.workflow_status === "revised") {
      const review = await setMeasureWorkflowStatus(workspaceId, measure.id, "in_review")
      if (review.error) {
        measures.push({ title: measure.title, status: "blocked", error: review.error })
        continue
      }
    }
    const approved = await approveProgrammeMeasure(workspaceId, measure.id)
    measures.push({
      title: measure.title,
      status: approved.error ? "blocked" : "approved",
      error: approved.error,
    })
  }

  const supabase = await createClient()
  const bindings = await getProgrammeBindings(workspaceId)
  const boundIds = new Set(Object.values(bindings.data.chapterDocuments || {}))
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, metadata")
    .eq("workspace_id", workspaceId)
  const chapters: Array<{ title: string; status: string; error?: string }> = []
  for (const document of documents || []) {
    const metadata = (document.metadata as Record<string, unknown> | null) || {}
    const isChapter = boundIds.has(document.id) || typeof metadata.programmeWorkflowStatus === "string"
    if (!isChapter) continue
    const current = parseChapterWorkflow(metadata)
    if (current === "approved") {
      chapters.push({ title: document.title, status: "already_approved" })
      continue
    }
    if (current === "generated" || current === "revised") {
      const review = await setChapterWorkflowStatus(workspaceId, document.id, "in_review")
      if (review.error) {
        chapters.push({ title: document.title, status: "blocked", error: review.error })
        continue
      }
    }
    const approved = await setChapterWorkflowStatus(workspaceId, document.id, "approved")
    chapters.push({
      title: document.title,
      status: approved.error ? "blocked" : "approved",
      error: approved.error,
    })
  }

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { measures, chapters } }
}

export async function listProgrammeReviewers(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized", data: [], currentUserId: null as string | null }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspace } = await supabase.from("workspaces").select("space_id").eq("id", workspaceId).single()
  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
  const { data: spaceMembers } = workspace?.space_id
    ? await supabase.from("space_members").select("user_id").eq("space_id", workspace.space_id)
    : { data: [] as Array<{ user_id: string }> }
  const ids = [...new Set([...(workspaceMembers || []), ...(spaceMembers || [])].map((row) => row.user_id).filter(Boolean))]
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ids)
    : { data: [] as Array<{ id: string; email: string; full_name: string | null }> }
  return {
    data: (profiles || []).map((profile) => ({
      id: profile.id,
      email: profile.email,
      name: profile.full_name || profile.email || profile.id.slice(0, 8),
    })),
    currentUserId: user?.id ?? null,
  }
}

export async function setChapterWorkflowStatus(
  workspaceId: string,
  documentId: string,
  status: ChapterWorkflowStatus,
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, content, metadata")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !document) return { error: error?.message || "Chapter not found" }
  const current = parseChapterWorkflow(document.metadata)
  if (status === "approved" && current === "generated") {
    return { error: "Request review before approval — generated chapters cannot jump to approved" }
  }
  const { data: workspace } = await supabase.from("workspaces").select("metadata, created_by").eq("id", workspaceId).single()
  const meta = (document.metadata as Record<string, unknown> | null) || {}
  const documentOwnerId = parseDocumentOwnerId(workspace?.metadata) || workspace?.created_by || null
  const chapterOwnerId = parseChapterOwnerId(document.metadata)
  const accessRole = user ? await getUserWorkspaceRole(user.id, workspaceId) : null
  const writer = canWriteChapter({
    actorId: user?.id,
    accessRole,
    documentOwnerId,
    chapterOwnerId,
  })
  if (status === "in_review" && !writer) {
    return { error: "Only the chapter owner can request review" }
  }
  if (status === "approved") {
    const createdBy =
      typeof meta.createdBy === "string"
        ? meta.createdBy
        : typeof meta.lastEditedBy === "string"
          ? meta.lastEditedBy
          : user?.id
    const policies = parseProgrammePolicies(workspace?.metadata)
    const reviewerGate = evaluateDistinctReviewerApproval({
      distinctReviewer: policies.distinctReviewer,
      actorId: user?.id,
      assignedReviewerId: typeof meta.assignedReviewerId === "string" ? meta.assignedReviewerId : null,
      createdBy,
    })
    if (!reviewerGate.ok) return { error: reviewerGate.reason }
    if (!policies.distinctReviewer && !writer) {
      return { error: "Only the chapter owner can freeze this chapter" }
    }
  }
  const metadata = {
    ...((document.metadata as Record<string, unknown>) || {}),
    programmeWorkflowStatus: status,
  }
  const { data: saved, error: updateError } = await supabase
    .from("documents")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .select("id, content, metadata")
    .single()
  if (updateError || !saved) return { error: updateError?.message || "Failed to update chapter status" }
  await snapshotArtefact({
    workspaceId,
    artefactType: "document",
    artefactId: documentId,
    snapshot: { content: saved.content, programmeWorkflowStatus: status },
    reason: `chapter workflow:${status}`,
  })
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { documentId: saved.id, workflowStatus: status } }
}

async function loadLatestFillJob(workspaceId: string): Promise<FillJob | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_jobs")
    .select("id, status, cancelled, progress, started_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", "fill")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return parseFillJobRecord(data)
}

async function loadReusableFillProgress(workspaceId: string): Promise<FillJob["progress"]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_jobs")
    .select("id, status, cancelled, progress, started_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", "fill")
    .order("created_at", { ascending: false })
    .limit(10)
  if (error || !data) return []
  return mergeOkFillProgress(data.map((row) => parseFillJobRecord(row)?.progress || []))
}

function cancelledFillJob(job: FillJob): FillJob {
  return {
    ...job,
    cancelled: true,
    status: "cancelled",
    updatedAt: new Date().toISOString(),
    progress: job.progress.map((item) => (item.status === "pending" ? { ...item, status: "cancelled" } : item)),
  }
}

async function isFillCancelRequested(workspaceId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  const metadata = (data?.metadata as Record<string, unknown> | null) || {}
  return metadata.fillCancelRequested === true
}

async function persistFillJob(workspaceId: string, job: FillJob, userId?: string | null) {
  const supabase = await createClient()
  const row = {
    status: job.status,
    cancelled: job.cancelled,
    progress: job.progress,
    updated_at: job.updatedAt,
    started_at: job.startedAt || null,
    completed_at: job.status === "running" ? null : job.updatedAt,
    error: job.progress.find((item) => item.status === "error")?.error ?? null,
  }
  const { data: existing } = await supabase
    .from("programme_jobs")
    .select("id, cancelled")
    .eq("id", job.id)
    .maybeSingle()
  if (existing?.cancelled) {
    row.cancelled = true
    if (row.status === "running" || row.status === "done") row.status = "cancelled"
    job = { ...job, cancelled: true, status: row.status as FillJob["status"] }
  }
  if (existing) {
    const { error } = await supabase.from("programme_jobs").update(row).eq("id", job.id).eq("workspace_id", workspaceId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from("programme_jobs").insert({
      id: job.id,
      workspace_id: workspaceId,
      kind: "fill",
      created_by: userId ?? null,
      ...row,
    })
    if (error) return { error: error.message }
  }
  await patchWorkspaceMetadata(workspaceId, { fillJob: job })
  return { data: job }
}

export async function getFillProgrammeJob(workspaceId: string) {
  const fromTable = await loadLatestFillJob(workspaceId)
  if (fromTable) return { data: fromTable }
  const supabase = await createClient()
  const { data, error } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  if (error || !data) return { error: error?.message || "Not found", data: null as FillJob | null }
  return { data: parseFillJob(data.metadata) }
}

export async function cancelFillProgramme(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const flagged = await patchWorkspaceMetadata(workspaceId, { fillCancelRequested: true })
  if (flagged.error) return { error: flagged.error }
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data: running } = await supabase
    .from("programme_jobs")
    .select("id, status, cancelled, progress, started_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", "fill")
    .eq("status", "running")
  const rows = running || []
  for (const row of rows) {
    const parsed = parseFillJobRecord(row)
    if (!parsed) continue
    const next: FillJob = {
      ...parsed,
      cancelled: true,
      status: "cancelled",
      updatedAt: now,
      progress: parsed.progress.map((item) => (item.status === "pending" ? { ...item, status: "cancelled" } : item)),
    }
    const saved = await persistFillJob(workspaceId, next)
    if (saved.error) return { error: saved.error }
  }
  if (rows.length === 0) return { data: { cancelled: true, pendingStart: true } }
  return { data: { cancelled: true, pendingStart: false } }
}

export async function retryFillProgramme(workspaceId: string, spaceId: string) {
  return fillProgrammeChapters(workspaceId, spaceId, { retry: true })
}

export async function seedLocalProgrammeReviewer(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  if (env.NODE_ENV === "production") return { error: "Local reviewer seed is development-only" }
  let hostname = ""
  try {
    hostname = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
  } catch {
    hostname = ""
  }
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return { error: "Local reviewer seed is only available against local Supabase" }
  }

  const email = "reviewer.dev@example.com"
  const password = "localdevpassword123"
  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, space_id")
    .eq("id", workspaceId)
    .single()
  if (workspaceError || !workspace) return { error: workspaceError?.message || "Workspace not found" }

  let userId: string | null = null
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Local reviewer" },
  })
  if (created.data.user?.id) {
    userId = created.data.user.id
  } else {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    userId = listed.data.users.find((user) => user.email === email)?.id ?? null
  }
  if (!userId) return { error: created.error?.message || "Could not create local reviewer" }

  await admin.from("profiles").upsert(
    { id: userId, email, full_name: "Local reviewer", language: "en" },
    { onConflict: "id" },
  )
  const { error: spaceError } = await admin.from("space_members").upsert(
    { space_id: workspace.space_id, user_id: userId, role: "member" },
    { onConflict: "space_id,user_id" },
  )
  if (spaceError) return { error: spaceError.message }
  const { error: memberError } = await admin.from("workspace_members").upsert(
    { workspace_id: workspaceId, user_id: userId, role: "member" },
    { onConflict: "workspace_id,user_id" },
  )
  if (memberError) return { error: memberError.message }

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { id: userId, email, name: "Local reviewer" } }
}

export async function updateDocumentRoleMetadata(
  documentId: string,
  workspaceId: string,
  input: {
    documentRole?: DocumentRole | null
    adoptingBody?: string | null
    adoptionDate?: string | null
    validityStart?: string | null
    validityEnd?: string | null
  },
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  if (input.documentRole != null && !isDocumentRole(input.documentRole)) {
    return { error: "Invalid document role" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("documents")
    .update({
      document_role: input.documentRole ?? null,
      adopting_body: input.adoptingBody ?? null,
      adoption_date: input.adoptionDate ?? null,
      validity_start: input.validityStart ?? null,
      validity_end: input.validityEnd ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)

  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${workspaceId}`)
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: true }
}

export async function bindProgrammeDocumentRole(
  workspaceId: string,
  documentId: string,
  role: DocumentRole | null,
) {
  const updated = await updateDocumentRoleMetadata(documentId, workspaceId, { documentRole: role })
  if (updated.error) return updated
  const current = await getProgrammeBindings(workspaceId)
  if (current.error) return current
  return updateProgrammeBindings(workspaceId, applyDocumentRoleToBindings(current.data, documentId, role))
}

const CORPUS_FIXTURES: Array<{ title: string; role: DocumentRole; content: string }> = [
  {
    title: "Environmental vision — housing near nodes (fixture)",
    role: "environmental_vision",
    content:
      "<h1>Environmental vision</h1><p>The province concentrates new housing near stations and mobility nodes. Ambition: Housing near nodes. Provincial interest 14 (housing) and 20 (urbanisation) apply.</p><p>Quiet landscapes stay free of large-scale sprawl. Station-area housing must improve liveability and remain aligned with this vision.</p>",
  },
  {
    title: "Existing housing programme — station pilots (fixture)",
    role: "existing_policy",
    content:
      "<h1>Housing programme 2024</h1><p>Continue two station-area housing pilots with provincial co-funding. Allocate budget 2026–2030. Success: two pilots contracted by 2028. Cite this programme when proposing measures that densify near stations.</p>",
  },
  {
    title: "Environmental effects report — station densification (fixture)",
    role: "environmental_effects_report",
    content:
      "<h1>Environmental effects report</h1><p>Theme: liveability near stations. Densification near nodes is assessed as a positive effect when it reduces car kilometres. Theme: landscape quiet. Sprawl outside nodes is a negative deviation from this effects report.</p>",
  },
]

export async function seedProgrammeCorpusFixtures(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { createWorkspaceDocument } = await import("@/lib/actions/document")
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("documents")
    .select("id, title")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .neq("status", "deleted")

  const titles = new Set((existing || []).map((row) => row.title))
  const created: string[] = []
  for (const fixture of CORPUS_FIXTURES) {
    if (titles.has(fixture.title)) continue
    const made = await createWorkspaceDocument(workspaceId, {
      title: fixture.title,
      content: fixture.content,
    })
    if (made.error || !made.data) return { error: made.error || "Failed to create corpus fixture" }
    const bound = await bindProgrammeDocumentRole(workspaceId, made.data.id, fixture.role)
    if (bound.error) return { error: bound.error }
    created.push(made.data.id)
  }

  return { data: { created: created.length } }
}

export async function rebuildDocumentSections(documentId: string, workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const result = await rebuildDocumentSectionsWithClient(supabase, documentId, workspaceId)
  if (result.error) return { error: result.error }
  return { data: { count: result.count } }
}

export async function findDuplicateDocuments(workspaceId: string, contentHash: string, excludeDocumentId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from("documents")
    .select("id, title, content_hash")
    .eq("workspace_id", workspaceId)
    .eq("content_hash", contentHash)
  if (excludeDocumentId) query = query.neq("id", excludeDocumentId)
  const { data, error } = await query
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

/**
 * Ensure a workspace chapter draft exists for an outline node and is linked in programmeBindings.
 */
export async function ensureChapterDocument(
  workspaceId: string,
  outlineNodeId: string,
  opts: { title: string; purposeHtml?: string | null },
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const bindingsResult = await getProgrammeBindings(workspaceId)
  const bindings = bindingsResult.data || emptyProgrammeBindings()
  const existingId = bindings.chapterDocuments?.[outlineNodeId]

  const supabase = await createClient()

  if (existingId) {
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, title, content")
      .eq("id", existingId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (!error && doc) {
      return { data: { documentId: doc.id, title: doc.title, content: doc.content || "", created: false } }
    }
  }

  const ownership = await loadProgrammeOwnership(workspaceId)
  if (
    !canAdministerProgramme({
      actorId: ownership.user?.id,
      accessRole: ownership.accessRole,
      documentOwnerId: ownership.documentOwnerId,
    })
  ) {
    return { error: "Only the document owner can create a chapter stub" }
  }

  const { createWorkspaceDocument } = await import("@/lib/actions/document")
  const stub =
    opts.purposeHtml && opts.purposeHtml.trim()
      ? `<h1>${escapeBasic(opts.title)}</h1>${opts.purposeHtml}`
      : `<h1>${escapeBasic(opts.title)}</h1><p></p>`

  const created = await createWorkspaceDocument(workspaceId, {
    title: opts.title,
    content: stub,
  })
  if (created.error || !created.data) return { error: created.error || "Failed to create chapter document" }

  if (ownership.documentOwnerId) {
    const { data: createdRow } = await supabase
      .from("documents")
      .select("metadata")
      .eq("id", created.data.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    await supabase
      .from("documents")
      .update({
        metadata: {
          ...((createdRow?.metadata as Record<string, unknown>) || {}),
          chapterOwnerId: ownership.documentOwnerId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", created.data.id)
      .eq("workspace_id", workspaceId)
  }

  const next: ProgrammeBindings = {
    ...bindings,
    chapterDocuments: {
      ...(bindings.chapterDocuments || {}),
      [outlineNodeId]: created.data.id,
    },
  }
  const saved = await updateProgrammeBindings(workspaceId, next)
  if (saved.error) return { error: saved.error }

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return {
    data: {
      documentId: created.data.id,
      title: created.data.title,
      content: created.data.content || stub,
      created: true,
      bindings: next,
    },
  }
}

export async function getChapterDocument(workspaceId: string, documentId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, content, metadata")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  if (error || !data) return { error: error?.message || "Not found" }
  const metadata = (data.metadata as Record<string, unknown> | null) || {}
  return {
    data: {
      documentId: data.id,
      title: data.title,
      content: data.content || "",
      workflowStatus: parseChapterWorkflow(data.metadata),
      assignedReviewerId: typeof metadata.assignedReviewerId === "string" ? metadata.assignedReviewerId : null,
      chapterOwnerId: parseChapterOwnerId(metadata),
    },
  }
}

export async function listProgrammeChapters(workspaceId: string) {
  const bindings = await getProgrammeBindings(workspaceId)
  const ids = Object.values(bindings.data.chapterDocuments || {})
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, content, metadata")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .neq("status", "deleted")
  if (error) return { error: error.message, data: [] }
  const bound = new Set(ids)
  return {
    data: (data || [])
      .filter((row) => bound.has(row.id) || typeof (row.metadata as Record<string, unknown> | null)?.programmeWorkflowStatus === "string")
      .map((row) => {
        const metadata = (row.metadata as Record<string, unknown> | null) || {}
        const outlineNodeId =
          Object.entries(bindings.data.chapterDocuments || {}).find(([, documentId]) => documentId === row.id)?.[0] ||
          null
        return {
          documentId: row.id,
          title: row.title,
          workflowStatus: parseChapterWorkflow(row.metadata),
          assignedReviewerId: typeof metadata.assignedReviewerId === "string" ? metadata.assignedReviewerId : null,
          chapterOwnerId: parseChapterOwnerId(metadata),
          createdBy:
            typeof (row.metadata as Record<string, unknown> | null)?.createdBy === "string"
              ? ((row.metadata as Record<string, unknown>).createdBy as string)
              : typeof (row.metadata as Record<string, unknown> | null)?.lastEditedBy === "string"
                ? ((row.metadata as Record<string, unknown>).lastEditedBy as string)
                : null,
          outlineNodeId,
          content: typeof row.content === "string" ? row.content : "",
          hasBody: Boolean(typeof row.content === "string" && row.content.replace(/<[^>]+>/g, "").trim()),
        }
      }),
  }
}

export async function assignChapterReviewer(workspaceId: string, documentId: string, reviewerId: string | null) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, metadata")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !document) return { error: error?.message || "Chapter not found" }
  const metadata = {
    ...((document.metadata as Record<string, unknown>) || {}),
    assignedReviewerId: reviewerId,
  }
  const { error: updateError } = await supabase
    .from("documents")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
  if (updateError) return { error: updateError.message }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { documentId, assignedReviewerId: reviewerId } }
}

export async function assignChapterOwner(workspaceId: string, documentId: string, ownerId: string | null) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const ownership = await loadProgrammeOwnership(workspaceId)
  if (ownership.error) return { error: ownership.error }
  if (
    !canAdministerProgramme({
      actorId: ownership.user?.id,
      accessRole: ownership.accessRole,
      documentOwnerId: ownership.documentOwnerId,
    })
  ) {
    return { error: "Only the document owner can assign chapter owners" }
  }
  const supabase = await createClient()
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, metadata")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !document) return { error: error?.message || "Chapter not found" }
  const metadata = {
    ...((document.metadata as Record<string, unknown>) || {}),
    chapterOwnerId: ownerId,
  }
  const { error: updateError } = await supabase
    .from("documents")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
  if (updateError) return { error: updateError.message }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { documentId, chapterOwnerId: ownerId } }
}

export async function regenerateProgrammeChapter(
  workspaceId: string,
  outlineNodeId: string,
  options?: { instructions?: string; documentId?: string },
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { requireSectionLock } = await import("@/lib/actions/collaboration")
  const lock = await requireSectionLock(workspaceId, `chapter:${outlineNodeId}`)
  if (lock.error) return { error: lock.error }

  const bindings = await getProgrammeBindings(workspaceId)
  if (!bindings.data.templateId) return { error: "Bind a template first" }
  const { listProgrammeOutlineNodes } = await import("@/lib/actions/outline")
  const nodes = await listProgrammeOutlineNodes(bindings.data.templateId)
  const node = nodes.data.find((item) => item.id === outlineNodeId)
  if (!node) return { error: "Outline node not found" }

  const chapter = options?.documentId
    ? { data: { documentId: options.documentId }, error: undefined as string | undefined }
    : await ensureChapterDocument(workspaceId, outlineNodeId, { title: node.title, purposeHtml: node.purpose })
  if (chapter.error || !chapter.data) return { error: chapter.error || "Chapter document missing" }

  const ownership = await loadProgrammeOwnership(workspaceId)
  const supabase = await createClient()
  const { data: chapterRow } = await supabase
    .from("documents")
    .select("metadata")
    .eq("id", chapter.data.documentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  if (
    !canWriteChapter({
      actorId: ownership.user?.id,
      accessRole: ownership.accessRole,
      documentOwnerId: ownership.documentOwnerId,
      chapterOwnerId: parseChapterOwnerId(chapterRow?.metadata),
    })
  ) {
    return { error: "Only the chapter owner can generate this chapter" }
  }

  const privileged = [
    bindings.data.environmentalVisionDocumentIds.length
      ? `Privileged vision docs: ${bindings.data.environmentalVisionDocumentIds.join(", ")}`
      : "",
    node.qualityRules ? `Node quality: ${node.qualityRules}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const { generateWorkspaceDocumentDraft } = await import("@/lib/actions/document")
  const draft = await generateWorkspaceDocumentDraft(workspaceId, chapter.data.documentId, {
    instructions: options?.instructions?.trim() || node.instructions || `Draft the required chapter “${node.title}”.`,
    citationMode: "strict",
    outlineNodeId,
    privilegedContext: privileged,
  })
  if (draft.error) return { error: draft.error }

  await setChapterWorkflowStatus(workspaceId, chapter.data.documentId, "generated")
  const { snapshotArtefact } = await import("@/lib/actions/collaboration")
  await snapshotArtefact({
    workspaceId,
    artefactType: "document",
    artefactId: chapter.data.documentId,
    snapshot: { content: draft.data?.content, programmeWorkflowStatus: "generated", outlineNodeId },
    reason: "chapter regen",
  })
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { ...draft.data, documentId: chapter.data.documentId, outlineNodeId } }
}

function escapeBasic(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export async function assessDocumentGroundedness(workspaceId: string, documentId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, content")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !document) return { error: error?.message || "Document not found" }

  const { getAllWorkspaceKnowledge } = await import("@/lib/rag/search")
  const { assessGroundedness } = await import("@/lib/programme/reliability")
  const { sources } = await getAllWorkspaceKnowledge(workspaceId, [documentId])
  const evidence = (sources || [])
    .map((s: { documentId?: string; id?: string; content?: string }) => {
      const id = s.documentId || s.id
      if (typeof id !== "string") return null
      return { documentId: id, text: typeof s.content === "string" ? s.content : "" }
    })
    .filter((e): e is { documentId: string; text: string } => Boolean(e))

  const report = assessGroundedness(document.content || "", evidence)
  return { data: report }
}

export async function previewBoundAgentSources(workspaceId: string, stage: import("@/lib/programme/domain").AgentStage) {
  const { boundAgentId } = await import("@/lib/programme/domain")
  const { getLatestAgentVersion } = await import("@/lib/actions/agent")
  const { resolveAgentSourceDocuments, formatSourcePreview } = await import("@/lib/programme/source-set")
  const bindingsResult = await getProgrammeBindings(workspaceId)
  const bindings = bindingsResult.data
  const agentId = boundAgentId(bindings, stage)
  const version = agentId ? (await getLatestAgentVersion(agentId)).data : null
  const { documents, sourceIds } = await resolveAgentSourceDocuments({ workspaceId, version, bindings })
  return {
    data: {
      agentId,
      versionId: version?.id ?? null,
      provider: version?.provider ?? null,
      model: version?.model ?? null,
      sourceIds,
      preview: formatSourcePreview(documents),
      titles: documents.map((d) => d.title),
    },
  }
}

export async function ensureDefaultAgentsBound(workspaceId: string, spaceId: string) {
  const { seedDefaultSpaceAgents, listSpaceAgents } = await import("@/lib/actions/agent")
  const seeded = await seedDefaultSpaceAgents(spaceId)
  if (seeded.error) return { error: seeded.error }
  const listed = (await listSpaceAgents(spaceId)).data || seeded.data?.agents || []
  const current = await getProgrammeBindings(workspaceId)
  const agentBindings: ProgrammeBindings["agentBindings"] = { ...(current.data.agentBindings || {}) }
  for (const agent of listed) {
    if (agentBindings[agent.stage]) continue
    const sameStage = listed.filter((candidate) => candidate.stage === agent.stage)
    const preferred =
      sameStage.find((candidate) => {
        const provider = candidate.latestVersion?.provider
        return provider === "openai-compatible" || provider === "openai"
      }) || agent
    agentBindings[agent.stage] = preferred.id
  }
  return bindWorkspaceAgents(workspaceId, agentBindings)
}

export async function fillProgrammeChapters(
  workspaceId: string,
  spaceId: string,
  options?: { retry?: boolean },
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const ownership = await loadProgrammeOwnership(workspaceId)
  if (
    !canAdministerProgramme({
      actorId: ownership.user?.id,
      accessRole: ownership.accessRole,
      documentOwnerId: ownership.documentOwnerId,
    })
  ) {
    return { error: "Only the document owner can fill required chapters" }
  }
  void spaceId
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const previous = await loadLatestFillJob(workspaceId)
  const reusableProgress = await loadReusableFillProgress(workspaceId)
  const now = new Date().toISOString()
  let job: FillJob = {
    id: crypto.randomUUID(),
    status: "running",
    cancelled: false,
    progress: [],
    startedAt: now,
    updatedAt: now,
  }
  await patchWorkspaceMetadata(workspaceId, { fillCancelRequested: false })
  const stub = await persistFillJob(workspaceId, job, user?.id)
  if (stub.error) return { error: stub.error }
  if ((await isFillCancelRequested(workspaceId)) || (await loadLatestFillJob(workspaceId))?.cancelled) {
    job = cancelledFillJob(job)
    await persistFillJob(workspaceId, job, user?.id)
    return { data: { progress: job.progress, cancelled: true } }
  }

  const { listProgrammeOutlineNodes } = await import("@/lib/actions/outline")
  const bindingsResult = await getProgrammeBindings(workspaceId)
  const bindings = bindingsResult.data
  if (!bindings.templateId) {
    job = { ...job, status: "failed", updatedAt: new Date().toISOString() }
    await persistFillJob(workspaceId, job, user?.id)
    return { error: "Bind a template first" }
  }
  const nodes = await listProgrammeOutlineNodes(bindings.templateId)
  const required = nodes.data.filter((n) => n.required)
  const alreadyOk = reusableProgress.length > 0
    ? reusableProgress
    : previous?.progress.filter((item) => item.status === "ok") || []
  const todo = options?.retry || alreadyOk.length > 0 ? remainingFillNodes(required, alreadyOk) : required
  if (todo.length === 0) {
    job = { ...job, status: "done", updatedAt: new Date().toISOString(), progress: alreadyOk }
    await persistFillJob(workspaceId, job, user?.id)
    return { data: { progress: alreadyOk, cancelled: false, skipped: true } }
  }

  job = {
    ...job,
    progress: [
      ...alreadyOk,
      ...todo.map((node) => ({ nodeId: node.id, title: node.title, status: "pending" as const })),
    ],
    updatedAt: new Date().toISOString(),
  }
  const started = await persistFillJob(workspaceId, job, user?.id)
  if (started.error) return { error: started.error }
  if (started.data?.cancelled || (await isFillCancelRequested(workspaceId))) {
    job = cancelledFillJob(started.data || job)
    await persistFillJob(workspaceId, job, user?.id)
    return { data: { progress: job.progress, cancelled: true } }
  }

  const FILL_CONCURRENCY = 2
  let persistChain = Promise.resolve()
  const persistProgress = (nodeId: string, status: "ok" | "error", error?: string) => {
    persistChain = persistChain.then(async () => {
      job = {
        ...job,
        updatedAt: new Date().toISOString(),
        progress: job.progress.map((item) => (item.nodeId === nodeId ? { ...item, status, error } : item)),
      }
      const saved = await persistFillJob(workspaceId, job, user?.id)
      if (saved.data) job = saved.data
    })
    return persistChain
  }

  const queue = [...todo]
  const workers = Array.from({ length: Math.min(FILL_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const node = queue.shift()
      if (!node) return
      const latest = (await loadLatestFillJob(workspaceId)) || job
      if (latest.cancelled || latest.id !== job.id || (await isFillCancelRequested(workspaceId))) {
        queue.length = 0
        return
      }
      const chapter = await ensureChapterDocument(workspaceId, node.id, {
        title: node.title,
        purposeHtml: node.purpose,
      })
      if (chapter.error || !chapter.data) {
        await persistProgress(node.id, "error", chapter.error)
        continue
      }
      if ((await loadLatestFillJob(workspaceId))?.cancelled || (await isFillCancelRequested(workspaceId))) {
        queue.length = 0
        return
      }
      const draft = await regenerateProgrammeChapter(workspaceId, node.id, {
        documentId: chapter.data.documentId,
        instructions: node.instructions || `Draft the required chapter “${node.title}”.`,
      })
      await persistProgress(node.id, draft.error ? "error" : "ok", draft.error || undefined)
    }
  })
  await Promise.all(workers)
  await persistChain

  const latest = (await loadLatestFillJob(workspaceId)) || job
  if (latest.cancelled || (await isFillCancelRequested(workspaceId))) {
    job = cancelledFillJob(latest)
    await persistFillJob(workspaceId, job, user?.id)
    return { data: { progress: job.progress, cancelled: true } }
  }

  const hasError = job.progress.some((item) => item.status === "error")
  job = { ...job, status: hasError ? "failed" : "done", updatedAt: new Date().toISOString() }
  await persistFillJob(workspaceId, job, user?.id)
  return { data: { progress: job.progress, cancelled: false } }
}
