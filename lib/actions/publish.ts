"use server"

import { createHash, randomBytes } from "node:crypto"
import { cookies, headers } from "next/headers"
import MarkdownIt from "markdown-it"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { env } from "@/lib/env"
import { checkRateLimit, publishCodeRateLimit } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"
import {
  buildPublicationCitation,
  canCitePublication,
  canRevealPublicationBody,
  isPublicationVisibility,
  publicationCookieName,
  publicationIsExpired,
  publicationIsRevoked,
  type PublicationVisibility,
} from "@/lib/programme/publish"
import { canPublishProgrammeSnapshot } from "@/lib/programme/consultation"
import { loadConsultationPublishBlock } from "@/lib/actions/consultation"

const markdownParser = new MarkdownIt({ html: false, linkify: true, breaks: true })

export type ProgrammePublicationSummary = {
  id: string
  workspaceId: string
  spaceId: string
  freezeId: string
  title: string
  periodLabel: string | null
  citation: string
  visibility: PublicationVisibility
  publishedAt: string
  expiresAt: string | null
  revokedAt: string | null
  contentHash: string | null
  workspaceName?: string
}

export type PublishedReadingRoom =
  | { status: "ok"; publication: ProgrammePublicationSummary; bodyMarkdown: string; authorityName: string }
  | { status: "needs_code"; publication: Pick<ProgrammePublicationSummary, "id" | "title" | "visibility"> }
  | { status: "login"; publication: Pick<ProgrammePublicationSummary, "id" | "title" | "visibility"> }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "missing" }

function hashAccessCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex")
}

function mapRow(
  row: Record<string, unknown>,
  workspaceName?: string,
): ProgrammePublicationSummary {
  const visibility = isPublicationVisibility(row.visibility) ? row.visibility : "permissioned"
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    spaceId: String(row.space_id),
    freezeId: String(row.freeze_id),
    title: String(row.title || ""),
    periodLabel: typeof row.period_label === "string" ? row.period_label : null,
    citation: String(row.citation || ""),
    visibility,
    publishedAt: String(row.published_at || ""),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    contentHash: typeof row.content_hash === "string" ? row.content_hash : null,
    workspaceName,
  }
}

async function isAuthorityMember(spaceId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  const supabase = await createClient()
  const { data } = await supabase
    .from("space_members")
    .select("user_id")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle()
  return Boolean(data)
}

export async function getActiveProgrammePublication(workspaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_publications")
    .select(
      "id, workspace_id, space_id, freeze_id, title, period_label, citation, visibility, published_at, expires_at, revoked_at, content_hash",
    )
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .maybeSingle()
  if (error) return { error: error.message, data: null as ProgrammePublicationSummary | null }
  return { data: data ? mapRow(data as Record<string, unknown>) : null }
}

export async function listCitablePublications(spaceId: string, excludeWorkspaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_publications")
    .select(
      "id, workspace_id, space_id, freeze_id, title, period_label, citation, visibility, published_at, expires_at, revoked_at, content_hash, workspaces(name)",
    )
    .eq("space_id", spaceId)
    .neq("workspace_id", excludeWorkspaceId)
    .is("revoked_at", null)
    .order("published_at", { ascending: false })
  if (error) return { error: error.message, data: [] as ProgrammePublicationSummary[] }
  return {
    data: (data || []).map((row) => {
      const record = row as Record<string, unknown>
      const workspace = record.workspaces
      const name =
        workspace && typeof workspace === "object" && !Array.isArray(workspace)
          ? String((workspace as { name?: string }).name || "")
          : Array.isArray(workspace)
            ? String((workspace[0] as { name?: string } | undefined)?.name || "")
            : ""
      return mapRow(record, name || undefined)
    }),
  }
}

export async function listSpacePublicationIds(spaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_publications")
    .select("id, workspace_id")
    .eq("space_id", spaceId)
    .is("revoked_at", null)
  if (error) return { data: {} as Record<string, string>, error: error.message }
  const byWorkspace: Record<string, string> = {}
  for (const row of data || []) {
    byWorkspace[String(row.workspace_id)] = String(row.id)
  }
  return { data: byWorkspace }
}

export async function publishProgrammeSnapshot(input: {
  workspaceId: string
  visibility: PublicationVisibility
  periodLabel?: string | null
  expiresAt?: string | null
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  if (!isPublicationVisibility(input.visibility)) {
    return { error: "Choose permissioned, link and code, or public listing" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, space_id, metadata, created_by")
    .eq("id", input.workspaceId)
    .single()
  if (!workspace?.space_id) return { error: "Programme not found" }

  const { canAdministerProgramme, parseDocumentOwnerId } = await import("@/lib/programme/ownership")
  const { getUserWorkspaceRole } = await import("@/lib/middleware/authorization")
  const accessRole = user ? await getUserWorkspaceRole(user.id, input.workspaceId) : null
  if (
    !canAdministerProgramme({
      actorId: user?.id,
      accessRole,
      documentOwnerId: parseDocumentOwnerId(workspace.metadata) || workspace.created_by || null,
    })
  ) {
    return { error: "Only the document owner can publish this programme" }
  }

  const { data: freeze } = await supabase
    .from("programme_freezes")
    .select("id, content_hash, manifest, created_at")
    .eq("workspace_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let consultationBlock = { consultationWindowOpen: false, unresolvedCommentCount: 0 }
  try {
    consultationBlock = await loadConsultationPublishBlock(input.workspaceId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not check consultation" }
  }
  const gate = canPublishProgrammeSnapshot({
    hasFreeze: Boolean(freeze),
    ...consultationBlock,
  })
  if (!gate.ok || !freeze) return { error: gate.ok === false ? gate.reason : "Freeze this programme before publishing" }

  const { data: space } = await supabase.from("spaces").select("name").eq("id", workspace.space_id).maybeSingle()
  const authorityName = space?.name || "Authority"
  const manifest = (freeze.manifest || {}) as Record<string, unknown>
  const bodyMarkdown =
    typeof manifest.composedMarkdown === "string" && manifest.composedMarkdown.trim()
      ? manifest.composedMarkdown
      : `# ${workspace.name}\n\nNo composed body was stored on this freeze.`
  const contentHash =
    typeof freeze.content_hash === "string" && freeze.content_hash
      ? freeze.content_hash
      : createHash("sha256").update(bodyMarkdown).digest("hex")
  const publishedAt = new Date().toISOString()
  const citation = buildPublicationCitation({
    title: workspace.name,
    authorityName,
    publishedAt,
    contentHash,
  })

  const expiresAt =
    input.visibility === "link_code" && input.expiresAt && !Number.isNaN(new Date(input.expiresAt).getTime())
      ? new Date(input.expiresAt).toISOString()
      : input.visibility === "link_code"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null

  let accessCode: string | null = null
  let accessCodeHash: string | null = null
  if (input.visibility === "link_code") {
    accessCode = randomBytes(5).toString("hex")
    accessCodeHash = hashAccessCode(accessCode)
  }

  await supabase
    .from("programme_publications")
    .update({ revoked_at: publishedAt })
    .eq("workspace_id", input.workspaceId)
    .is("revoked_at", null)

  const { data: inserted, error } = await supabase
    .from("programme_publications")
    .insert({
      workspace_id: input.workspaceId,
      space_id: workspace.space_id,
      freeze_id: freeze.id,
      title: workspace.name,
      period_label: input.periodLabel?.trim() || null,
      citation,
      visibility: input.visibility,
      access_code_hash: accessCodeHash,
      expires_at: expiresAt,
      body_markdown: bodyMarkdown,
      content_hash: contentHash,
      published_by: user?.id ?? null,
      published_at: publishedAt,
    })
    .select(
      "id, workspace_id, space_id, freeze_id, title, period_label, citation, visibility, published_at, expires_at, revoked_at, content_hash",
    )
    .single()

  if (error || !inserted) return { error: error?.message || "Could not publish snapshot" }

  revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  revalidatePath(`/spaces/${workspace.space_id}`)
  revalidatePath(`/published/${inserted.id}`)

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return {
    data: {
      publication: mapRow(inserted as Record<string, unknown>, workspace.name),
      readingRoomUrl: `${appUrl}/published/${inserted.id}`,
      accessCode,
    },
  }
}

export async function revokeProgrammePublication(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("programme_publications")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: true }
}

export async function getPublishedProgrammeForReading(publicationId: string): Promise<PublishedReadingRoom> {
  if (!publicationId) return { status: "missing" }
  const admin = createAdminClient()
  const { data: row } = await admin
    .from("programme_publications")
    .select(
      "id, workspace_id, space_id, freeze_id, title, period_label, citation, visibility, published_at, expires_at, revoked_at, content_hash, body_markdown, access_code_hash",
    )
    .eq("id", publicationId)
    .maybeSingle()

  if (!row) return { status: "missing" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const member = await isAuthorityMember(String(row.space_id), user?.id)
  const visibility = isPublicationVisibility(row.visibility) ? row.visibility : "permissioned"
  const cookieStore = await cookies()
  const cookieHash = cookieStore.get(publicationCookieName(String(row.id)))?.value
  const accessCodeOk = Boolean(row.access_code_hash && cookieHash && cookieHash === row.access_code_hash)

  const reveal = canRevealPublicationBody({
    visibility,
    revoked: publicationIsRevoked(row.revoked_at),
    expired: publicationIsExpired(row.expires_at),
    isAuthorityMember: member,
    accessCodeOk,
  })

  if (!reveal.ok && reveal.reason === "revoked") return { status: "revoked" }
  if (!reveal.ok && reveal.reason === "expired") return { status: "expired" }
  if (!reveal.ok && reveal.reason === "login") {
    return { status: "login", publication: { id: String(row.id), title: String(row.title), visibility } }
  }
  if (!reveal.ok && reveal.reason === "code") {
    return { status: "needs_code", publication: { id: String(row.id), title: String(row.title), visibility } }
  }

  const { data: space } = await admin.from("spaces").select("name").eq("id", row.space_id).maybeSingle()
  return {
    status: "ok",
    publication: mapRow(row as Record<string, unknown>),
    bodyMarkdown: String(row.body_markdown || ""),
    authorityName: space?.name || "Authority",
  }
}

export async function unlockPublishedProgramme(publicationId: string, code: string) {
  const headerStore = await headers()
  const rate = await checkRateLimit(publishCodeRateLimit, `pub-code:${getClientIdentifier(headerStore)}:${publicationId}`)
  if (!rate.success) return { error: "Too many code attempts. Wait and try again." }

  const trimmed = code.trim()
  if (!trimmed) return { error: "Enter the access code" }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("programme_publications")
    .select("id, visibility, access_code_hash, expires_at, revoked_at")
    .eq("id", publicationId)
    .maybeSingle()

  if (!row || publicationIsRevoked(row.revoked_at)) return { error: "This snapshot is not available" }
  if (!isPublicationVisibility(row.visibility) || row.visibility !== "link_code") {
    return { error: "This snapshot does not use an access code" }
  }
  if (publicationIsExpired(row.expires_at)) return { error: "This link has expired" }
  if (!row.access_code_hash || hashAccessCode(trimmed) !== row.access_code_hash) {
    return { error: "That code does not match" }
  }

  const cookieStore = await cookies()
  cookieStore.set(publicationCookieName(String(row.id)), row.access_code_hash, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: `/published/${row.id}`,
    maxAge: 30 * 24 * 60 * 60,
  })
  return { data: true }
}

export async function bindPublishedProgrammeAsPolicy(targetWorkspaceId: string, publicationId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: targetWorkspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: publication, error: pubError } = await supabase
    .from("programme_publications")
    .select(
      "id, workspace_id, space_id, freeze_id, title, citation, body_markdown, content_hash, revoked_at, period_label",
    )
    .eq("id", publicationId)
    .maybeSingle()

  if (pubError) return { error: pubError.message }
  if (!publication) return { error: "Published snapshot not found" }

  const cite = canCitePublication({
    sourceWorkspaceId: String(publication.workspace_id),
    targetWorkspaceId,
    revoked: publicationIsRevoked(publication.revoked_at),
  })
  if (!cite.ok) return { error: cite.reason }

  const { data: target } = await supabase.from("workspaces").select("space_id").eq("id", targetWorkspaceId).single()
  if (!target?.space_id || target.space_id !== publication.space_id) {
    return { error: "Cite only a published sister programme in the same authority" }
  }

  const { data: existingDocs } = await supabase
    .from("documents")
    .select("id, metadata")
    .eq("workspace_id", targetWorkspaceId)
    .neq("status", "archived")
    .neq("status", "deleted")

  const already = (existingDocs || []).find((doc) => {
    const metadata = (doc.metadata || {}) as Record<string, unknown>
    return metadata.origin === "published_programme" && metadata.publicationId === publication.id
  })
  if (already) {
    const { bindProgrammeDocumentRole } = await import("@/lib/actions/programme")
    const bound = await bindProgrammeDocumentRole(targetWorkspaceId, already.id, "existing_policy")
    if (bound.error) return { error: bound.error }
    revalidatePath(`/workspaces/${targetWorkspaceId}/programme`)
    return { data: { documentId: already.id, publicationId: publication.id } }
  }

  const html = markdownParser.render(String(publication.body_markdown || publication.citation || ""))
  const { createWorkspaceDocument } = await import("@/lib/actions/document")
  const created = await createWorkspaceDocument(targetWorkspaceId, {
    title: `${publication.title} (published)`,
    content: html,
  })
  if (created.error || !created.data) return { error: created.error || "Could not copy the published snapshot" }

  const previousMetadata = (created.data.metadata || {}) as Record<string, unknown>
  const { error: metaError } = await supabase
    .from("documents")
    .update({
      metadata: {
        ...previousMetadata,
        origin: "published_programme",
        publicationId: publication.id,
        freezeId: publication.freeze_id,
        contentHash: publication.content_hash,
        sourceWorkspaceId: publication.workspace_id,
        citation: publication.citation,
        periodLabel: publication.period_label,
      },
    })
    .eq("id", created.data.id)
    .eq("workspace_id", targetWorkspaceId)

  if (metaError) return { error: metaError.message }

  const { bindProgrammeDocumentRole } = await import("@/lib/actions/programme")
  const bound = await bindProgrammeDocumentRole(targetWorkspaceId, created.data.id, "existing_policy")
  if (bound.error) return { error: bound.error }
  revalidatePath(`/workspaces/${targetWorkspaceId}/programme`)
  return { data: { documentId: created.data.id, publicationId: publication.id } }
}
