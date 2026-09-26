"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireAuthAndPermission, getUserWorkspaceRole } from "@/lib/middleware/authorization"
import {
  assertConsultationCommentInput,
  assertConsultationTransition,
  assertConsultationWindow,
  buildConsultationManifestSlice,
  canPublishProgrammeSnapshot,
  canSubmitConsultationComment,
  consultationWindowStatus,
  isConsultationCommentStatus,
  isUnresolvedConsultationStatus,
  planClusterResolution,
  type ConsultationCommentStatus,
} from "@/lib/programme/consultation"
import {
  buildPublicTopicSummaryDraft,
  canReviewConsultationAppeal,
  canSubmitConsultationAppeal,
  fallbackClusterDraft,
  nearestClusterId,
  normalizeConsultationQuote,
  parseClusterDraft,
  proposeConsultationClusters,
  type ClusterableComment,
  type ClusterDraft,
  type ProposedCluster,
} from "@/lib/programme/consultation-cluster"
import { groupByMeaning, workspaceWritingLanguage } from "@/lib/programme/meaning-groups-llm"
import { joinGroupsSharing } from "@/lib/programme/meaning-groups"
import { canAdministerProgramme, parseDocumentOwnerId } from "@/lib/programme/ownership"
import {
  canRevealPublicationBody,
  isPublicationVisibility,
  publicationCookieName,
  publicationIsExpired,
  publicationIsRevoked,
} from "@/lib/programme/publish"

export type ConsultationSummary = {
  id: string
  workspaceId: string
  publicationId: string
  title: string | null
  opensAt: string
  closesAt: string
  closedAt: string | null
  window: ReturnType<typeof consultationWindowStatus>
}

export type ConsultationCommentRow = {
  id: string
  consultationId: string
  workspaceId: string
  publicationId: string
  authorId: string
  authorName: string | null
  body: string
  quoteText: string
  quoteLocator: string | null
  status: ConsultationCommentStatus
  clusterId: string | null
  createdAt: string
  latestReason: string | null
}

export type ConsultationReplyRow = {
  id: string
  commentId: string
  authorId: string
  authorName: string | null
  body: string
  createdAt: string
}

export type ConsultationClusterRow = {
  id: string
  consultationId: string
  label: string
  summary: string | null
  suggestedResponse: string | null
  suggestedStatus: ConsultationCommentStatus | null
  ownerSummary: string | null
  memberCount: number
  confidence: number | null
  publishedAt: string | null
  appliedAt: string | null
  appliedStatus: ConsultationCommentStatus | null
  memberIds: string[]
}

export type ConsultationAppealRow = {
  id: string
  commentId: string
  authorId: string
  authorName: string | null
  body: string
  createdAt: string
  reviewedAt: string | null
  outcome: "reopen" | "upheld" | null
}

export type ConsultationTopicSummaryRow = {
  id: string
  consultationId: string
  publicationId: string
  bodyMarkdown: string
  aiDraft: boolean
  publishedAt: string | null
}

export type ConsultationQueue = {
  consultation: ConsultationSummary | null
  comments: ConsultationCommentRow[]
  replies: ConsultationReplyRow[]
  clusters: ConsultationClusterRow[]
  appeals: ConsultationAppealRow[]
  topicSummary: ConsultationTopicSummaryRow | null
  unresolvedCount: number
  windowOpen: boolean
  clusterJob: { id: string; status: string; error: string | null } | null
}

const UNRESOLVED_STATUSES = ["open", "in_discussion"] as const

function missingRelation(error: { message?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return /does not exist|schema cache/i.test(message)
}

function mapConsultation(row: Record<string, unknown>): ConsultationSummary {
  const opensAt = String(row.opens_at || "")
  const closesAt = String(row.closes_at || "")
  const closedAt = typeof row.closed_at === "string" ? row.closed_at : null
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    publicationId: String(row.publication_id),
    title: typeof row.title === "string" ? row.title : null,
    opensAt,
    closesAt,
    closedAt,
    window: consultationWindowStatus({ opensAt, closesAt, closedAt }),
  }
}

async function loadAuthorNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map<string, string>()
  const admin = createAdminClient()
  const { data } = await admin.from("profiles").select("id, email, full_name").in("id", unique)
  return new Map(
    (data || []).map((row) => [String(row.id), String(row.full_name || row.email || "")]),
  )
}

function mapComment(
  row: Record<string, unknown>,
  names: Map<string, string>,
): ConsultationCommentRow {
  const status = isConsultationCommentStatus(row.status) ? row.status : "open"
  const authorId = String(row.author_id || "")
  return {
    id: String(row.id),
    consultationId: String(row.consultation_id),
    workspaceId: String(row.workspace_id),
    publicationId: String(row.publication_id),
    authorId,
    authorName: names.get(authorId) || null,
    body: String(row.body || ""),
    quoteText: String(row.quote_text || ""),
    quoteLocator: typeof row.quote_locator === "string" ? row.quote_locator : null,
    status,
    clusterId: typeof row.cluster_id === "string" ? row.cluster_id : null,
    createdAt: String(row.created_at || ""),
    latestReason: typeof row.latestReason === "string" ? row.latestReason : null,
  }
}

function emptyQueue(consultation: ConsultationSummary | null = null): ConsultationQueue {
  return {
    consultation,
    comments: [],
    replies: [],
    clusters: [],
    appeals: [],
    topicSummary: null,
    unresolvedCount: 0,
    windowOpen: consultation?.window === "open",
    clusterJob: null,
  }
}

function mapReply(row: Record<string, unknown>, names: Map<string, string>): ConsultationReplyRow {
  const authorId = String(row.author_id || "")
  return {
    id: String(row.id),
    commentId: String(row.comment_id),
    authorId,
    authorName: names.get(authorId) || null,
    body: String(row.body || ""),
    createdAt: String(row.created_at || ""),
  }
}

function mapAppeal(row: Record<string, unknown>, names: Map<string, string>): ConsultationAppealRow {
  const authorId = String(row.author_id || "")
  const outcome = row.outcome === "reopen" || row.outcome === "upheld" ? row.outcome : null
  return {
    id: String(row.id),
    commentId: String(row.comment_id),
    authorId,
    authorName: names.get(authorId) || null,
    body: String(row.body || ""),
    createdAt: String(row.created_at || ""),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    outcome,
  }
}

function mapTopicSummary(row: Record<string, unknown>): ConsultationTopicSummaryRow {
  return {
    id: String(row.id),
    consultationId: String(row.consultation_id),
    publicationId: String(row.publication_id),
    bodyMarkdown: String(row.body_markdown || ""),
    aiDraft: row.ai_draft !== false,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
  }
}

async function loadCommentReasons(commentIds: string[]) {
  const reasons = new Map<string, string>()
  if (commentIds.length === 0) return reasons
  const admin = createAdminClient()
  const { data } = await admin
    .from("consultation_comment_events")
    .select("comment_id, reason, created_at")
    .in("comment_id", commentIds)
    .not("reason", "is", null)
    .order("created_at", { ascending: false })
  for (const row of data || []) {
    const id = String(row.comment_id)
    if (reasons.has(id) || !row.reason) continue
    reasons.set(id, String(row.reason))
  }
  return reasons
}

async function loadConsultationExtras(workspaceId: string, consultationId: string | null, commentIds: string[]) {
  const admin = createAdminClient()
  const [repliesResult, clusterResult, appealResult, summaryResult, jobResult] = await Promise.all([
    commentIds.length
      ? admin
          .from("consultation_replies")
          .select("id, comment_id, author_id, body, created_at")
          .in("comment_id", commentIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    consultationId
      ? admin
          .from("consultation_clusters")
          .select(
            "id, consultation_id, label, summary, suggested_response, suggested_status, owner_summary, member_count, confidence, published_at, applied_at, applied_status",
          )
          .eq("consultation_id", consultationId)
          .order("member_count", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    commentIds.length
      ? admin
          .from("consultation_appeals")
          .select("id, comment_id, author_id, body, created_at, reviewed_at, outcome")
          .in("comment_id", commentIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    consultationId
      ? admin
          .from("consultation_topic_summaries")
          .select("id, consultation_id, publication_id, body_markdown, ai_draft, published_at")
          .eq("consultation_id", consultationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("programme_jobs")
      .select("id, status, error")
      .eq("workspace_id", workspaceId)
      .eq("kind", "consultation_cluster")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const authorIds = [
    ...(repliesResult.data || []).map((row) => String((row as { author_id?: string }).author_id || "")),
    ...(appealResult.data || []).map((row) => String((row as { author_id?: string }).author_id || "")),
  ]
  const names = await loadAuthorNames(authorIds)
  const replies = (repliesResult.data || []).map((row) => mapReply(row as Record<string, unknown>, names))
  const appeals = (appealResult.data || []).map((row) => mapAppeal(row as Record<string, unknown>, names))
  const clusters = (clusterResult.data || []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      id: String(record.id),
      consultationId: String(record.consultation_id),
      label: String(record.label || ""),
      summary: typeof record.summary === "string" ? record.summary : null,
      suggestedResponse: typeof record.suggested_response === "string" ? record.suggested_response : null,
      suggestedStatus: isConsultationCommentStatus(record.suggested_status) ? record.suggested_status : null,
      ownerSummary: typeof record.owner_summary === "string" ? record.owner_summary : null,
      memberCount: Number(record.member_count || 0),
      confidence: typeof record.confidence === "number" ? record.confidence : null,
      publishedAt: typeof record.published_at === "string" ? record.published_at : null,
      appliedAt: typeof record.applied_at === "string" ? record.applied_at : null,
      appliedStatus: isConsultationCommentStatus(record.applied_status) ? record.applied_status : null,
      memberIds: [] as string[],
    }
  })
  return {
    replies,
    clusters,
    appeals,
    topicSummary: summaryResult.data ? mapTopicSummary(summaryResult.data as Record<string, unknown>) : null,
    clusterJob: jobResult.data
      ? {
          id: String(jobResult.data.id),
          status: String(jobResult.data.status),
          error: typeof jobResult.data.error === "string" ? jobResult.data.error : null,
        }
      : null,
  }
}

async function requireProgrammeAdministrator(workspaceId: string) {
  const { userId } = await requireAuthAndPermission("workspace:update", { workspaceId })
  const supabase = await createClient()
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("metadata, created_by")
    .eq("id", workspaceId)
    .single()
  const accessRole = await getUserWorkspaceRole(userId, workspaceId)
  if (
    !canAdministerProgramme({
      actorId: userId,
      accessRole,
      documentOwnerId: parseDocumentOwnerId(workspace?.metadata) || workspace?.created_by || null,
    })
  ) {
    throw new Error("Only the document owner can manage consultation")
  }
  return userId
}

async function publicationIsReadable(publication: {
  id: string
  space_id: string
  visibility: string
  revoked_at: string | null
  expires_at: string | null
  access_code_hash: string | null
}): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let isAuthorityMember = false
  if (user?.id) {
    const { data: membership } = await supabase
      .from("space_members")
      .select("user_id")
      .eq("space_id", publication.space_id)
      .eq("user_id", user.id)
      .maybeSingle()
    isAuthorityMember = Boolean(membership)
  }
  const cookieStore = await cookies()
  const cookieHash = cookieStore.get(publicationCookieName(publication.id))?.value
  const accessCodeOk = Boolean(
    publication.access_code_hash && cookieHash && cookieHash === publication.access_code_hash,
  )
  const visibility = isPublicationVisibility(publication.visibility) ? publication.visibility : "permissioned"
  return canRevealPublicationBody({
    visibility,
    revoked: publicationIsRevoked(publication.revoked_at),
    expired: publicationIsExpired(publication.expires_at),
    isAuthorityMember,
    accessCodeOk,
  }).ok
}

export async function loadConsultationPublishBlock(workspaceId: string): Promise<{
  consultationWindowOpen: boolean
  unresolvedCommentCount: number
}> {
  const admin = createAdminClient()
  const { data: consultations, error: consultationError } = await admin
    .from("programme_consultations")
    .select("id, opens_at, closes_at, closed_at")
    .eq("workspace_id", workspaceId)
  if (consultationError) {
    if (missingRelation(consultationError)) {
      return { consultationWindowOpen: false, unresolvedCommentCount: 0 }
    }
    throw new Error(consultationError.message)
  }
  const consultationWindowOpen = (consultations || []).some(
    (row) =>
      consultationWindowStatus({
        opensAt: String(row.opens_at),
        closesAt: String(row.closes_at),
        closedAt: row.closed_at,
      }) === "open",
  )
  const { count, error: commentError } = await admin
    .from("consultation_comments")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("status", [...UNRESOLVED_STATUSES])
  if (commentError) {
    if (missingRelation(commentError)) {
      return { consultationWindowOpen, unresolvedCommentCount: 0 }
    }
    throw new Error(commentError.message)
  }
  return { consultationWindowOpen, unresolvedCommentCount: count || 0 }
}

export async function getConsultationPublishGate(workspaceId: string, hasFreeze: boolean) {
  try {
    const block = await loadConsultationPublishBlock(workspaceId)
    return canPublishProgrammeSnapshot({ hasFreeze, ...block })
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : "Could not check consultation" }
  }
}

export async function getProgrammeConsultationQueue(workspaceId: string): Promise<{
  error?: string
  data?: ConsultationQueue
}> {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const admin = createAdminClient()
  const { data: consultationRow, error: consultationError } = await admin
    .from("programme_consultations")
    .select("id, workspace_id, publication_id, title, opens_at, closes_at, closed_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (consultationError) {
    if (missingRelation(consultationError)) return { data: emptyQueue() }
    return { error: consultationError.message }
  }
  const consultation = consultationRow ? mapConsultation(consultationRow as Record<string, unknown>) : null
  const { data: commentRows, error: commentError } = await admin
    .from("consultation_comments")
    .select(
      "id, consultation_id, workspace_id, publication_id, author_id, body, quote_text, quote_locator, status, cluster_id, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
  if (commentError) {
    if (missingRelation(commentError)) return { data: emptyQueue(consultation) }
    return { error: commentError.message }
  }
  const names = await loadAuthorNames((commentRows || []).map((row) => String(row.author_id || "")))
  const commentIds = (commentRows || []).map((row) => String(row.id))
  const [reasons, extras] = await Promise.all([
    loadCommentReasons(commentIds),
    loadConsultationExtras(workspaceId, consultation?.id || null, commentIds),
  ])
  const comments = (commentRows || []).map((row) =>
    mapComment({ ...(row as Record<string, unknown>), latestReason: reasons.get(String(row.id)) || null }, names),
  )
  for (const cluster of extras.clusters) {
    cluster.memberIds = comments.filter((comment) => comment.clusterId === cluster.id).map((comment) => comment.id)
    cluster.memberCount = cluster.memberIds.length
  }
  return {
    data: {
      ...extras,
      consultation,
      comments,
      unresolvedCount: comments.filter((row) => isUnresolvedConsultationStatus(row.status)).length,
      windowOpen: consultation?.window === "open",
    },
  }
}

export async function openProgrammeConsultation(input: {
  workspaceId: string
  publicationId: string
  opensAt: string
  closesAt: string
  title?: string | null
}) {
  try {
    const userId = await requireProgrammeAdministrator(input.workspaceId)
    const window = assertConsultationWindow(input)
    if (!window.ok) return { error: window.reason }

    const admin = createAdminClient()
    const { data: publication } = await admin
      .from("programme_publications")
      .select("id, workspace_id, revoked_at")
      .eq("id", input.publicationId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle()
    if (!publication) return { error: "Publish a snapshot before opening consultation" }
    if (publicationIsRevoked(publication.revoked_at)) {
      return { error: "This snapshot is no longer published" }
    }

    const { data: existing } = await admin
      .from("programme_consultations")
      .select("id, opens_at, closes_at, closed_at")
      .eq("publication_id", input.publicationId)
      .is("closed_at", null)
      .maybeSingle()
    if (existing) {
      const existingWindow = consultationWindowStatus({
        opensAt: String(existing.opens_at),
        closesAt: String(existing.closes_at),
        closedAt: existing.closed_at,
      })
      if (existingWindow === "open" || existingWindow === "scheduled") {
        return { error: "This snapshot already has an open consultation" }
      }
      await admin
        .from("programme_consultations")
        .update({ closed_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("workspace_id", input.workspaceId)
    }

    const { data, error } = await admin
      .from("programme_consultations")
      .insert({
        workspace_id: input.workspaceId,
        publication_id: input.publicationId,
        title: input.title?.trim() || null,
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        created_by: userId,
      })
      .select("id, workspace_id, publication_id, title, opens_at, closes_at, closed_at")
      .single()
    if (error) {
      if (/idx_programme_consultations_one_active|duplicate key/i.test(error.message)) {
        return { error: "This snapshot already has an open consultation" }
      }
      return { error: error.message }
    }
    revalidatePath(`/workspaces/${input.workspaceId}/programme`)
    revalidatePath(`/published/${input.publicationId}`)
    return { data: mapConsultation(data as Record<string, unknown>) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function closeProgrammeConsultation(workspaceId: string, consultationId: string) {
  try {
    await requireProgrammeAdministrator(workspaceId)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("programme_consultations")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", consultationId)
      .eq("workspace_id", workspaceId)
      .is("closed_at", null)
      .select("id, workspace_id, publication_id, title, opens_at, closes_at, closed_at")
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: "Consultation is already closed" }
    revalidatePath(`/workspaces/${workspaceId}/programme`)
    revalidatePath(`/published/${data.publication_id}`)
    return { data: mapConsultation(data as Record<string, unknown>) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function getPublishedConsultation(publicationId: string): Promise<{
  error?: string
  data?: {
    consultation: ConsultationSummary | null
    canComment: boolean
    signedIn: boolean
    comments: ConsultationCommentRow[]
    replies: ConsultationReplyRow[]
    appeals: ConsultationAppealRow[]
    clusters: ConsultationClusterRow[]
    topicSummary: ConsultationTopicSummaryRow | null
  }
}> {
  if (!publicationId) return { error: "Missing publication" }
  const admin = createAdminClient()
  const { data: publication } = await admin
    .from("programme_publications")
    .select("id, workspace_id, space_id, visibility, revoked_at, expires_at, access_code_hash")
    .eq("id", publicationId)
    .maybeSingle()
  if (!publication) return { error: "Published snapshot not found" }
  const readable = await publicationIsReadable(publication)
  if (!readable) return { error: "This snapshot is not available" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: consultationRow, error: consultationError } = await admin
    .from("programme_consultations")
    .select("id, workspace_id, publication_id, title, opens_at, closes_at, closed_at, created_at")
    .eq("publication_id", publicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (consultationError && !missingRelation(consultationError)) return { error: consultationError.message }

  const consultation = consultationRow ? mapConsultation(consultationRow as Record<string, unknown>) : null
  const submit = consultation
    ? canSubmitConsultationComment({ signedIn: Boolean(user), window: consultation })
    : { ok: false as const, reason: "This snapshot is not open for comments" }

  let comments: ConsultationCommentRow[] = []
  let replies: ConsultationReplyRow[] = []
  let appeals: ConsultationAppealRow[] = []
  let clusters: ConsultationClusterRow[] = []
  if (user?.id) {
    const { data: commentRows } = await admin
      .from("consultation_comments")
      .select(
        "id, consultation_id, workspace_id, publication_id, author_id, body, quote_text, quote_locator, status, cluster_id, created_at",
      )
      .eq("publication_id", publicationId)
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
    const names = await loadAuthorNames([user.id])
    const commentIds = (commentRows || []).map((row) => String(row.id))
    const extras = await loadConsultationExtras(String(publication.workspace_id), consultation?.id || null, commentIds)
    const reasons = await loadCommentReasons(commentIds)
    comments = (commentRows || []).map((row) =>
      mapComment({ ...(row as Record<string, unknown>), latestReason: reasons.get(String(row.id)) || null }, names),
    )
    replies = extras.replies
    appeals = extras.appeals
    clusters = extras.clusters
  }

  const { data: summaryRow } = consultation
    ? await admin
        .from("consultation_topic_summaries")
        .select("id, consultation_id, publication_id, body_markdown, ai_draft, published_at")
        .eq("consultation_id", consultation.id)
        .not("published_at", "is", null)
        .maybeSingle()
    : { data: null }

  return {
    data: {
      consultation,
      canComment: submit.ok,
      signedIn: Boolean(user),
      comments,
      replies,
      appeals,
      clusters,
      topicSummary: summaryRow ? mapTopicSummary(summaryRow as Record<string, unknown>) : null,
    },
  }
}

export async function submitConsultationComment(input: {
  publicationId: string
  body: string
  quoteText: string
  quoteLocator?: string | null
}) {
  try {
    const userId = await requireAuth()
    const fields = assertConsultationCommentInput(input)
    if (!fields.ok) return { error: fields.reason }

    const admin = createAdminClient()
    const { data: publication } = await admin
      .from("programme_publications")
      .select("id, workspace_id, space_id, visibility, revoked_at, expires_at, access_code_hash")
      .eq("id", input.publicationId)
      .maybeSingle()
    if (!publication) return { error: "Published snapshot not found" }
    if (!(await publicationIsReadable(publication))) return { error: "This snapshot is not available" }

    const { data: consultationRow } = await admin
      .from("programme_consultations")
      .select("id, workspace_id, publication_id, title, opens_at, closes_at, closed_at")
      .eq("publication_id", input.publicationId)
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!consultationRow) return { error: "This snapshot is not open for comments" }

    const consultation = mapConsultation(consultationRow as Record<string, unknown>)
    const submit = canSubmitConsultationComment({ signedIn: true, window: consultation })
    if (!submit.ok) return { error: submit.reason }

    const { data, error } = await admin
      .from("consultation_comments")
      .insert({
        consultation_id: consultation.id,
        workspace_id: consultation.workspaceId,
        publication_id: consultation.publicationId,
        author_id: userId,
        body: fields.body,
        quote_text: fields.quoteText,
        quote_locator: input.quoteLocator?.trim() || null,
        status: "open",
      })
      .select(
        "id, consultation_id, workspace_id, publication_id, author_id, body, quote_text, quote_locator, status, cluster_id, created_at",
      )
      .single()
    if (error) return { error: error.message }

    const { data: existingClusters } = await admin
      .from("consultation_clusters")
      .select("id")
      .eq("consultation_id", consultation.id)
    if (existingClusters?.length) {
      const { data: samples } = await admin
        .from("consultation_comments")
        .select("id, quote_text, body, cluster_id")
        .eq("consultation_id", consultation.id)
        .not("cluster_id", "is", null)
        .limit(40)
      const clusterId = nearestClusterId({
        comment: {
          id: String(data.id),
          quoteText: fields.quoteText,
          body: fields.body,
          clusterId: null,
          locked: false,
        },
        clusters: (samples || [])
          .filter((row) => row.cluster_id)
          .map((row) => ({
            id: String(row.cluster_id),
            sample: {
              id: String(row.id),
              quoteText: String(row.quote_text || ""),
              body: String(row.body || ""),
              clusterId: String(row.cluster_id),
              locked: false,
            },
          })),
      })
      if (clusterId) {
        await admin.from("consultation_comments").update({ cluster_id: clusterId }).eq("id", data.id)
        data.cluster_id = clusterId
        const { data: cluster } = await admin
          .from("consultation_clusters")
          .select("member_count")
          .eq("id", clusterId)
          .maybeSingle()
        await admin
          .from("consultation_clusters")
          .update({ member_count: Number(cluster?.member_count || 0) + 1, updated_at: new Date().toISOString() })
          .eq("id", clusterId)
      }
    }

    await admin.from("consultation_comment_events").insert({
      comment_id: data.id,
      workspace_id: consultation.workspaceId,
      actor_id: userId,
      from_status: null,
      to_status: "open",
      reason: null,
      source: "system",
    })

    revalidatePath(`/published/${input.publicationId}`)
    revalidatePath(`/workspaces/${consultation.workspaceId}/programme`)
    const names = await loadAuthorNames([userId])
    return { data: mapComment(data as Record<string, unknown>, names) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function transitionConsultationComment(input: {
  workspaceId: string
  commentId: string
  toStatus: ConsultationCommentStatus
  reason: string
}) {
  try {
    const userId = await requireProgrammeAdministrator(input.workspaceId)
    if (!isConsultationCommentStatus(input.toStatus)) {
      return { error: "Unknown consultation status" }
    }
    const admin = createAdminClient()
    const { data: comment } = await admin
      .from("consultation_comments")
      .select("id, workspace_id, publication_id, status, cluster_id")
      .eq("id", input.commentId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle()
    if (!comment) return { error: "Comment not found" }
    const fromStatus = isConsultationCommentStatus(comment.status) ? comment.status : "open"
    const gate = assertConsultationTransition({
      from: fromStatus,
      to: input.toStatus,
      reason: input.reason,
    })
    if (!gate.ok) return { error: gate.reason }

    const { error: eventError } = await admin.from("consultation_comment_events").insert({
      comment_id: comment.id,
      workspace_id: input.workspaceId,
      actor_id: userId,
      from_status: fromStatus,
      to_status: input.toStatus,
      reason: input.reason.trim(),
      source: "owner",
    })
    if (eventError) return { error: eventError.message }

    const { error: updateError } = await admin
      .from("consultation_comments")
      .update({ status: input.toStatus })
      .eq("id", comment.id)
      .eq("workspace_id", input.workspaceId)
    if (updateError) return { error: updateError.message }

    if (comment.cluster_id && fromStatus !== input.toStatus) {
      await admin.from("consultation_cluster_corrections").upsert(
        {
          comment_id: comment.id,
          cluster_id: comment.cluster_id,
          workspace_id: input.workspaceId,
          actor_id: userId,
          note: input.reason.trim(),
        },
        { onConflict: "comment_id" },
      )
    }

    revalidatePath(`/workspaces/${input.workspaceId}/programme`)
    revalidatePath(`/published/${comment.publication_id}`)
    return { data: { id: comment.id, status: input.toStatus } }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function addConsultationReply(input: {
  commentId: string
  body: string
}) {
  try {
    const userId = await requireAuth()
    const body = input.body.trim()
    if (!body) return { error: "Reply cannot be empty" }
    const admin = createAdminClient()
    const { data: comment } = await admin
      .from("consultation_comments")
      .select("id, workspace_id, publication_id, author_id")
      .eq("id", input.commentId)
      .maybeSingle()
    if (!comment) return { error: "Comment not found" }

    const isAuthor = comment.author_id === userId
    let isOwner = false
    if (!isAuthor) {
      try {
        await requireProgrammeAdministrator(String(comment.workspace_id))
        isOwner = true
      } catch {
        isOwner = false
      }
    }
    if (!isAuthor && !isOwner) return { error: "You can only reply to your own comment" }

    const { data, error } = await admin
      .from("consultation_replies")
      .insert({
        comment_id: comment.id,
        workspace_id: comment.workspace_id,
        author_id: userId,
        body,
      })
      .select("id, comment_id, author_id, body, created_at")
      .single()
    if (error) return { error: error.message }
    const names = await loadAuthorNames([userId])
    revalidatePath(`/published/${comment.publication_id}`)
    revalidatePath(`/workspaces/${comment.workspace_id}/programme`)
    return { data: mapReply(data as Record<string, unknown>, names) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function applyConsultationClusterResolution(input: {
  workspaceId: string
  clusterId: string
  toStatus: ConsultationCommentStatus
  reason: string
}) {
  try {
    const userId = await requireProgrammeAdministrator(input.workspaceId)
    if (!isConsultationCommentStatus(input.toStatus)) {
      return { error: "Unknown consultation status" }
    }
    const admin = createAdminClient()
    const { data: members } = await admin
      .from("consultation_comments")
      .select("id, status, publication_id")
      .eq("workspace_id", input.workspaceId)
      .eq("cluster_id", input.clusterId)
    const { data: corrections } = await admin
      .from("consultation_cluster_corrections")
      .select("comment_id")
      .eq("cluster_id", input.clusterId)

    const statuses: Record<string, ConsultationCommentStatus> = {}
    for (const row of members || []) {
      statuses[String(row.id)] = isConsultationCommentStatus(row.status) ? row.status : "open"
    }
    const plan = planClusterResolution({
      memberIds: (members || []).map((row) => String(row.id)),
      correctedCommentIds: (corrections || []).map((row) => String(row.comment_id)),
      statuses,
      toStatus: input.toStatus,
      reason: input.reason,
    })
    if (!plan.ok) return { error: plan.reason }

    for (const commentId of plan.applyTo) {
      const fromStatus = statuses[commentId]
      const { error: eventError } = await admin.from("consultation_comment_events").insert({
        comment_id: commentId,
        workspace_id: input.workspaceId,
        actor_id: userId,
        from_status: fromStatus,
        to_status: input.toStatus,
        reason: input.reason.trim(),
        source: "cluster",
      })
      if (eventError) return { error: eventError.message }
      const { error: updateError } = await admin
        .from("consultation_comments")
        .update({ status: input.toStatus })
        .eq("id", commentId)
        .eq("workspace_id", input.workspaceId)
      if (updateError) return { error: updateError.message }
    }

    await admin
      .from("consultation_clusters")
      .update({
        applied_at: new Date().toISOString(),
        applied_status: input.toStatus,
        owner_summary: input.reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.clusterId)
      .eq("workspace_id", input.workspaceId)

    const publicationId = members?.[0] ? String(members[0].publication_id) : null
    revalidatePath(`/workspaces/${input.workspaceId}/programme`)
    if (publicationId) revalidatePath(`/published/${publicationId}`)
    return { data: { applied: plan.applyTo.length, skipped: (members || []).length - plan.applyTo.length } }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function listConsultationLedgerForManifest(workspaceId: string) {
  const admin = createAdminClient()
  const { data: consultations, error: consultationError } = await admin
    .from("programme_consultations")
    .select("id, publication_id, opens_at, closes_at, closed_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
  if (consultationError) {
    if (missingRelation(consultationError)) return buildConsultationManifestSlice({ consultations: [], comments: [] })
    throw new Error(consultationError.message)
  }
  const { data: comments, error: commentError } = await admin
    .from("consultation_comments")
    .select("id, consultation_id, status, author_id, quote_locator, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
  if (commentError) {
    if (missingRelation(commentError)) {
      return buildConsultationManifestSlice({
        consultations: (consultations || []).map((row) => ({
          id: String(row.id),
          publicationId: String(row.publication_id),
          opensAt: String(row.opens_at),
          closesAt: String(row.closes_at),
          closedAt: row.closed_at,
        })),
        comments: [],
      })
    }
    throw new Error(commentError.message)
  }
  return buildConsultationManifestSlice({
    consultations: (consultations || []).map((row) => ({
      id: String(row.id),
      publicationId: String(row.publication_id),
      opensAt: String(row.opens_at),
      closesAt: String(row.closes_at),
      closedAt: row.closed_at,
    })),
    comments: (comments || []).map((row) => ({
      id: String(row.id),
      consultationId: String(row.consultation_id),
      status: isConsultationCommentStatus(row.status) ? row.status : "open",
      authorId: String(row.author_id),
      quoteLocator: typeof row.quote_locator === "string" ? row.quote_locator : null,
      createdAt: String(row.created_at),
    })),
  })
}

async function draftClusterWithLlm(input: { label: string; comments: ClusterableComment[] }) {
  const fallback = fallbackClusterDraft(input)
  try {
    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const result = await completePlatformTask("summarize", {
      messages: [
        {
          role: "system",
          content:
            "You cluster consultation comments for a document owner. Return JSON only: {label, summary, suggestedResponse, suggestedStatus}. suggestedStatus must be one of in_discussion, accepted, accepted_with_modification, rejected, merged, out_of_scope. Do not decide for the owner; suggest only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            label: input.label,
            comments: input.comments.map((comment) => ({ quote: comment.quoteText, body: comment.body })),
          }),
        },
      ],
      maxTokens: 600,
      json: true,
    })
    return parseClusterDraft(result.text) || fallback
  } catch {
    return fallback
  }
}

async function persistEmbeddings(workspaceId: string, comments: Array<{ id: string; text: string }>) {
  try {
    const { resolvePlatformTaskLlmWithFallback } = await import("@/lib/llm/resolve")
    const { openaiClientForTarget } = await import("@/lib/llm/openai-client")
    const target = await resolvePlatformTaskLlmWithFallback("summarize", "chat")
    const client = openaiClientForTarget(target)
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: comments.map((comment) => comment.text.slice(0, 8000)),
    })
    const admin = createAdminClient()
    for (const [index, comment] of comments.entries()) {
      const embedding = response.data[index]?.embedding
      if (!embedding) continue
      await admin.from("consultation_embeddings").upsert({
        comment_id: comment.id,
        workspace_id: workspaceId,
        embedding,
        model: "text-embedding-3-small",
      })
    }
  } catch {
    // Lexical clustering still runs if embeddings are unavailable.
  }
}

export async function runConsultationClusterJob(workspaceId: string) {
  try {
    const userId = await requireProgrammeAdministrator(workspaceId)
    const admin = createAdminClient()
    const { data: consultation } = await admin
      .from("programme_consultations")
      .select("id, publication_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!consultation) return { error: "Open a consultation before clustering comments" }

    const { data: comments } = await admin
      .from("consultation_comments")
      .select("id, quote_text, body, cluster_id")
      .eq("consultation_id", consultation.id)
    if (!comments?.length) return { error: "There are no consultation comments to cluster" }

    const { data: corrections } = await admin
      .from("consultation_cluster_corrections")
      .select("comment_id")
      .eq("workspace_id", workspaceId)
    const locked = new Set((corrections || []).map((row) => String(row.comment_id)))

    const now = new Date().toISOString()
    const jobId = crypto.randomUUID()
    const { error: jobError } = await admin.from("programme_jobs").insert({
      id: jobId,
      workspace_id: workspaceId,
      kind: "consultation_cluster",
      status: "running",
      cancelled: false,
      progress: [{ nodeId: "cluster", title: "Cluster comments", status: "pending" }],
      created_by: userId,
      started_at: now,
      updated_at: now,
    })
    if (jobError) return { error: jobError.message }

    let clusterCount = 0
    try {
      await persistEmbeddings(
        workspaceId,
        comments.map((row) => ({
          id: String(row.id),
          text: `${row.quote_text || ""}\n${row.body || ""}`,
        })),
      )

      const clusterable: ClusterableComment[] = comments.map((row) => ({
        id: String(row.id),
        quoteText: String(row.quote_text || ""),
        body: String(row.body || ""),
        clusterId: typeof row.cluster_id === "string" ? row.cluster_id : null,
        locked: locked.has(String(row.id)),
      }))
      const fresh = locked.size === 0 && clusterable.every((comment) => !comment.clusterId)
      const quoteOf = new Map(clusterable.map((comment) => [comment.id, normalizeConsultationQuote(comment.quoteText)]))
      const byMeaning =
        fresh && clusterable.length >= 3
          ? joinGroupsSharing(
              await groupByMeaning(
                "responses",
                clusterable.map((comment) => ({ id: comment.id, body: comment.body, quote: comment.quoteText })),
                { workspaceId, minSize: 1 },
              ),
              (id) => quoteOf.get(id) || null,
            )
          : []
      const grouped = new Set(byMeaning.flatMap((group) => group.memberIds))
      const proposed: Array<ProposedCluster & { draft?: ClusterDraft }> = byMeaning.length
        ? [
            ...byMeaning.map((group) => ({
              memberIds: group.memberIds,
              reuseClusterId: null,
              label: group.label,
              confidence: 1,
              draft: {
                label: group.label,
                summary: group.summary || group.label,
                suggestedResponse: group.reply,
                suggestedStatus: isConsultationCommentStatus(group.status) && group.status !== "open" ? group.status : ("in_discussion" as const),
              },
            })),
            ...proposeConsultationClusters(clusterable.filter((comment) => !grouped.has(comment.id))),
          ]
        : proposeConsultationClusters(clusterable)
      clusterCount = proposed.length
      const byId = new Map(clusterable.map((comment) => [comment.id, comment]))

      for (const group of proposed) {
        const members = group.memberIds.map((id) => byId.get(id)).filter((item): item is ClusterableComment => Boolean(item))
        const draft = group.draft ?? (await draftClusterWithLlm({ label: group.label, comments: members }))
        let clusterId = group.reuseClusterId
        if (clusterId) {
          await admin
            .from("consultation_clusters")
            .update({
              label: draft.label,
              summary: draft.summary,
              suggested_response: draft.suggestedResponse,
              suggested_status: draft.suggestedStatus,
              member_count: group.memberIds.length,
              confidence: group.confidence,
              updated_at: new Date().toISOString(),
            })
            .eq("id", clusterId)
            .eq("workspace_id", workspaceId)
        } else {
          const { data: created, error: createError } = await admin
            .from("consultation_clusters")
            .insert({
              consultation_id: consultation.id,
              workspace_id: workspaceId,
              label: draft.label,
              summary: draft.summary,
              suggested_response: draft.suggestedResponse,
              suggested_status: draft.suggestedStatus,
              member_count: group.memberIds.length,
              confidence: group.confidence,
            })
            .select("id")
            .single()
          if (createError || !created) throw new Error(createError?.message || "Could not create a topic cluster")
          clusterId = created.id
        }
        for (const commentId of group.memberIds) {
          if (locked.has(commentId)) continue
          await admin
            .from("consultation_comments")
            .update({ cluster_id: clusterId })
            .eq("id", commentId)
            .eq("workspace_id", workspaceId)
        }
      }

      await admin
        .from("programme_jobs")
        .update({
          status: "done",
          progress: [{ nodeId: "cluster", title: "Cluster comments", status: "ok" }],
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)
    } catch (error) {
      await admin
        .from("programme_jobs")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : "Clustering failed",
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)
      return { error: error instanceof Error ? error.message : "Clustering failed" }
    }

    revalidatePath(`/workspaces/${workspaceId}/programme`)
    revalidatePath(`/published/${consultation.publication_id}`)
    return { data: { jobId, clusterCount } }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function unclusterConsultationComment(workspaceId: string, commentId: string, note?: string) {
  try {
    const userId = await requireProgrammeAdministrator(workspaceId)
    const admin = createAdminClient()
    const { data: comment } = await admin
      .from("consultation_comments")
      .select("id, cluster_id, publication_id")
      .eq("id", commentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (!comment?.cluster_id) return { error: "This comment is not in a topic cluster" }
    await admin.from("consultation_cluster_corrections").upsert(
      {
        comment_id: comment.id,
        cluster_id: comment.cluster_id,
        workspace_id: workspaceId,
        actor_id: userId,
        note: note?.trim() || "Removed from cluster",
      },
      { onConflict: "comment_id" },
    )
    await admin.from("consultation_comments").update({ cluster_id: null }).eq("id", comment.id)
    const { data: cluster } = await admin
      .from("consultation_clusters")
      .select("member_count")
      .eq("id", comment.cluster_id)
      .maybeSingle()
    await admin
      .from("consultation_clusters")
      .update({
        member_count: Math.max(0, Number(cluster?.member_count || 1) - 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", comment.cluster_id)
    revalidatePath(`/workspaces/${workspaceId}/programme`)
    revalidatePath(`/published/${comment.publication_id}`)
    return { data: { id: comment.id, clusterId: null } }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function draftConsultationTopicSummary(workspaceId: string) {
  try {
    await requireProgrammeAdministrator(workspaceId)
    const admin = createAdminClient()
    const { data: consultation } = await admin
      .from("programme_consultations")
      .select("id, publication_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!consultation) return { error: "Open a consultation before drafting a topic summary" }

    const [{ count }, { data: clusters }] = await Promise.all([
      admin
        .from("consultation_comments")
        .select("id", { count: "exact", head: true })
        .eq("consultation_id", consultation.id),
      admin
        .from("consultation_clusters")
        .select("label, summary, owner_summary, member_count, applied_status")
        .eq("consultation_id", consultation.id)
        .order("member_count", { ascending: false }),
    ])
    const bodyMarkdown = buildPublicTopicSummaryDraft({
      language: await workspaceWritingLanguage(workspaceId),
      commentCount: count || 0,
      clusters: (clusters || []).map((row) => ({
        label: String(row.label || "Topic"),
        memberCount: Number(row.member_count || 0),
        summary: row.summary,
        ownerSummary: row.owner_summary,
        appliedStatus: row.applied_status,
      })),
    })
    const { data, error } = await admin
      .from("consultation_topic_summaries")
      .upsert(
        {
          consultation_id: consultation.id,
          workspace_id: workspaceId,
          publication_id: consultation.publication_id,
          body_markdown: bodyMarkdown,
          ai_draft: true,
          published_at: null,
          published_by: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "consultation_id" },
      )
      .select("id, consultation_id, publication_id, body_markdown, ai_draft, published_at")
      .single()
    if (error) return { error: error.message }
    revalidatePath(`/workspaces/${workspaceId}/programme`)
    return { data: mapTopicSummary(data as Record<string, unknown>) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function publishConsultationTopicSummary(input: {
  workspaceId: string
  bodyMarkdown?: string | null
}) {
  try {
    const userId = await requireProgrammeAdministrator(input.workspaceId)
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("consultation_topic_summaries")
      .select("id, consultation_id, publication_id, body_markdown")
      .eq("workspace_id", input.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!existing) return { error: "Draft a topic summary before publishing it" }
    const bodyMarkdown = input.bodyMarkdown?.trim() || String(existing.body_markdown || "")
    if (!bodyMarkdown) return { error: "Topic summary cannot be empty" }
    const { data, error } = await admin
      .from("consultation_topic_summaries")
      .update({
        body_markdown: bodyMarkdown,
        ai_draft: false,
        published_at: new Date().toISOString(),
        published_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, consultation_id, publication_id, body_markdown, ai_draft, published_at")
      .single()
    if (error) return { error: error.message }
    revalidatePath(`/workspaces/${input.workspaceId}/programme`)
    revalidatePath(`/published/${existing.publication_id}`)
    return { data: mapTopicSummary(data as Record<string, unknown>) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function submitConsultationAppeal(input: { commentId: string; body: string }) {
  try {
    const userId = await requireAuth()
    const admin = createAdminClient()
    const { data: comment } = await admin
      .from("consultation_comments")
      .select("id, workspace_id, publication_id, author_id, status")
      .eq("id", input.commentId)
      .maybeSingle()
    if (!comment) return { error: "Comment not found" }
    const { data: pending } = await admin
      .from("consultation_appeals")
      .select("id")
      .eq("comment_id", comment.id)
      .is("reviewed_at", null)
      .maybeSingle()
    const gate = canSubmitConsultationAppeal({
      isAuthor: comment.author_id === userId,
      status: isConsultationCommentStatus(comment.status) ? comment.status : "open",
      hasPendingAppeal: Boolean(pending),
      body: input.body,
    })
    if (!gate.ok) return { error: gate.reason }
    const { data, error } = await admin
      .from("consultation_appeals")
      .insert({
        comment_id: comment.id,
        workspace_id: comment.workspace_id,
        author_id: userId,
        body: input.body.trim(),
      })
      .select("id, comment_id, author_id, body, created_at, reviewed_at, outcome")
      .single()
    if (error) return { error: error.message }
    const names = await loadAuthorNames([userId])
    revalidatePath(`/published/${comment.publication_id}`)
    revalidatePath(`/workspaces/${comment.workspace_id}/programme`)
    return { data: mapAppeal(data as Record<string, unknown>, names) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function reviewConsultationAppeal(input: {
  workspaceId: string
  appealId: string
  outcome: "reopen" | "upheld"
  reason: string
}) {
  try {
    const userId = await requireProgrammeAdministrator(input.workspaceId)
    if (!canReviewConsultationAppeal(input.outcome)) return { error: "Choose reopen or uphold" }
    if (!input.reason.trim()) return { error: "Record a reason for this appeal decision" }
    const admin = createAdminClient()
    const { data: appeal } = await admin
      .from("consultation_appeals")
      .select("id, comment_id, reviewed_at")
      .eq("id", input.appealId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle()
    if (!appeal) return { error: "Appeal not found" }
    if (appeal.reviewed_at) return { error: "This appeal has already been reviewed" }

    if (input.outcome === "reopen") {
      const moved = await transitionConsultationComment({
        workspaceId: input.workspaceId,
        commentId: String(appeal.comment_id),
        toStatus: "in_discussion",
        reason: input.reason,
      })
      if (moved.error) return { error: moved.error }
    }

    const { data, error } = await admin
      .from("consultation_appeals")
      .update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        outcome: input.outcome,
      })
      .eq("id", appeal.id)
      .select("id, comment_id, author_id, body, created_at, reviewed_at, outcome")
      .single()
    if (error) return { error: error.message }
    const names = await loadAuthorNames(data?.author_id ? [String(data.author_id)] : [])
    revalidatePath(`/workspaces/${input.workspaceId}/programme`)
    return { data: mapAppeal(data as Record<string, unknown>, names) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}
