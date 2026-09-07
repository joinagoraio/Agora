"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"

export async function snapshotArtefact(input: {
  workspaceId: string
  artefactType: "section" | "measure" | "playbook" | "document" | "agent"
  artefactId: string
  snapshot: Record<string, unknown>
  reason?: string
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("artefact_versions")
    .insert({
      workspace_id: input.workspaceId,
      artefact_type: input.artefactType,
      artefact_id: input.artefactId,
      snapshot: input.snapshot,
      reason: input.reason ?? null,
      created_by: user?.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function listArtefactVersions(workspaceId: string, artefactType: string, artefactId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("artefact_versions")
    .select("id, reason, created_at, created_by, snapshot")
    .eq("workspace_id", workspaceId)
    .eq("artefact_type", artefactType)
    .eq("artefact_id", artefactId)
    .order("created_at", { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function acquireSectionLock(workspaceId: string, sectionKey: string, ttlMinutes = 30) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const now = new Date()
  const { data: existing } = await supabase
    .from("section_locks")
    .select("locked_by, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("section_key", sectionKey)
    .maybeSingle()

  if (existing?.locked_by && existing.locked_by !== user.id) {
    const expiresAt = existing.expires_at ? new Date(existing.expires_at) : null
    if (expiresAt && expiresAt > now) {
      return { error: "Chapter is locked by another member", data: existing }
    }
  }

  const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString()
  const { data, error } = await supabase
    .from("section_locks")
    .upsert(
      {
        workspace_id: workspaceId,
        section_key: sectionKey,
        locked_by: user.id,
        locked_at: now.toISOString(),
        expires_at: expires,
      },
      { onConflict: "workspace_id,section_key" },
    )
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function requireSectionLock(workspaceId: string, sectionKey: string) {
  return acquireSectionLock(workspaceId, sectionKey)
}

export async function getSectionLockHolder(workspaceId: string, sectionKey: string) {
  const lock = await getSectionLock(workspaceId, sectionKey)
  if (lock.error || !lock.data?.locked_by) return { data: null, error: lock.error }
  const expiresAt = lock.data.expires_at ? new Date(lock.data.expires_at) : null
  if (expiresAt && expiresAt <= new Date()) return { data: null }
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("id", lock.data.locked_by)
    .maybeSingle()
  return {
    data: {
      userId: lock.data.locked_by,
      name: profile?.full_name || profile?.email || lock.data.locked_by.slice(0, 8),
      expiresAt: lock.data.expires_at,
    },
  }
}

export async function compareArtefactVersions(workspaceId: string, versionIdA: string, versionIdB: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("artefact_versions")
    .select("id, reason, created_at, snapshot")
    .eq("workspace_id", workspaceId)
    .in("id", [versionIdA, versionIdB])
  if (error) return { error: error.message }
  const a = (data || []).find((row) => row.id === versionIdA)
  const b = (data || []).find((row) => row.id === versionIdB)
  if (!a || !b) return { error: "Both versions are required" }
  const { diffSnapshots } = await import("@/lib/programme/analysis-reports")
  return {
    data: {
      versionA: a,
      versionB: b,
      diff: diffSnapshots(a.snapshot, b.snapshot),
    },
  }
}

export async function heartbeatSectionPresence(workspaceId: string, sectionKey: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  const now = new Date().toISOString()
  const { error } = await supabase.from("section_presence").upsert(
    {
      workspace_id: workspaceId,
      section_key: sectionKey,
      user_id: user.id,
      last_seen_at: now,
    },
    { onConflict: "workspace_id,section_key,user_id" },
  )
  if (error) return { error: error.message }
  return { data: { ok: true } }
}

export async function listSectionPresence(workspaceId: string, sectionKey: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cutoff = new Date(Date.now() - 45_000).toISOString()
  const { data, error } = await supabase
    .from("section_presence")
    .select("user_id, last_seen_at")
    .eq("workspace_id", workspaceId)
    .eq("section_key", sectionKey)
    .gte("last_seen_at", cutoff)
  if (error) return { error: error.message, data: [] }
  const others = (data || []).filter((row) => row.user_id !== user?.id)
  const ids = others.map((row) => row.user_id)
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", ids)
    : { data: [] as Array<{ id: string; email: string; full_name: string | null; avatar_url: string | null }> }
  return {
    data: others.map((row) => {
      const profile = (profiles || []).find((item) => item.id === row.user_id)
      return {
        userId: row.user_id,
        name: profile?.full_name || profile?.email || row.user_id.slice(0, 8),
        avatarUrl: profile?.avatar_url || null,
        lastSeenAt: row.last_seen_at,
      }
    }),
  }
}

export async function getSectionLock(workspaceId: string, sectionKey: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("section_locks")
    .select("locked_by, locked_at, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("section_key", sectionKey)
    .maybeSingle()
  if (error) return { error: error.message, data: null }
  return { data }
}

export async function restoreArtefactVersion(workspaceId: string, versionId: string, reason: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  if (!reason.trim()) return { error: "A restore reason is required" }

  const supabase = await createClient()
  const { data: version, error } = await supabase
    .from("artefact_versions")
    .select("*")
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !version) return { error: error?.message || "Version not found" }

  const snapshot = (version.snapshot || {}) as Record<string, unknown>
  if (version.artefact_type === "measure") {
    const { error: updateError } = await supabase
      .from("programme_measures")
      .update({
        title: snapshot.title,
        measure_type: snapshot.measure_type,
        specific_action: snapshot.specific_action,
        owner_role: snapshot.owner_role,
        geography: snapshot.geography,
        timeline: snapshot.timeline,
        indicator: snapshot.indicator,
        success_criterion: snapshot.success_criterion,
        contributes_to_vision: snapshot.contributes_to_vision,
        provincial_interests: snapshot.provincial_interests,
        narrative: snapshot.narrative,
        citations: snapshot.citations,
        workflow_status: snapshot.workflow_status === "approved" ? "revised" : snapshot.workflow_status,
        outline_node_id: snapshot.outline_node_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", version.artefact_id)
      .eq("workspace_id", workspaceId)
    if (updateError) return { error: updateError.message }
  } else if (version.artefact_type === "document" || version.artefact_type === "section") {
    const { data: document } = await supabase
      .from("documents")
      .select("metadata")
      .eq("id", version.artefact_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    const metadata = {
      ...((document?.metadata as Record<string, unknown>) || {}),
    }
    if (typeof snapshot.programmeWorkflowStatus === "string") {
      metadata.programmeWorkflowStatus =
        snapshot.programmeWorkflowStatus === "approved" ? "revised" : snapshot.programmeWorkflowStatus
    }
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        content: typeof snapshot.content === "string" ? snapshot.content : "",
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", version.artefact_id)
      .eq("workspace_id", workspaceId)
    if (updateError) return { error: updateError.message }
  }

  return snapshotArtefact({
    workspaceId,
    artefactType: version.artefact_type,
    artefactId: version.artefact_id,
    snapshot,
    reason: `restore: ${reason}`,
  })
}

export async function releaseSectionLock(workspaceId: string, sectionKey: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { error } = await supabase
    .from("section_locks")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("section_key", sectionKey)
    .eq("locked_by", user.id)

  if (error) return { error: error.message }
  return { data: true }
}
