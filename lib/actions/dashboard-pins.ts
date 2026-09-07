"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type DashboardPinKind = "programme" | "authority"

export type DashboardPin = {
  kind: DashboardPinKind
  id: string
}

async function requireUserId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" as const }
  return { userId: user.id }
}

async function canPinItem(userId: string, kind: DashboardPinKind, itemId: string) {
  const admin = createAdminClient()
  if (kind === "authority") {
    const { data } = await admin
      .from("space_members")
      .select("user_id")
      .eq("space_id", itemId)
      .eq("user_id", userId)
      .maybeSingle()
    return Boolean(data)
  }

  const { data: workspace } = await admin
    .from("workspaces")
    .select("id, space_id")
    .eq("id", itemId)
    .maybeSingle()
  if (!workspace?.space_id) return false

  const { data: spaceMember } = await admin
    .from("space_members")
    .select("user_id")
    .eq("space_id", workspace.space_id)
    .eq("user_id", userId)
    .maybeSingle()
  if (spaceMember) return true

  const { data: workspaceMember } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", itemId)
    .eq("user_id", userId)
    .maybeSingle()
  return Boolean(workspaceMember)
}

export async function listDashboardPins() {
  const access = await requireUserId()
  if ("error" in access) return { data: [] as DashboardPin[], error: access.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("dashboard_pins")
    .select("item_kind, item_id")
    .eq("user_id", access.userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[listDashboardPins]", error.message)
    return { data: [] as DashboardPin[] }
  }

  return {
    data: (data ?? []).map((row) => ({
      kind: row.item_kind as DashboardPinKind,
      id: row.item_id as string,
    })),
  }
}

export async function toggleDashboardPin(kind: DashboardPinKind, itemId: string) {
  const access = await requireUserId()
  if ("error" in access) return { error: access.error }

  if (!(await canPinItem(access.userId, kind, itemId))) {
    return { error: "You don't have access to this item" }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("dashboard_pins")
    .select("id")
    .eq("user_id", access.userId)
    .eq("item_kind", kind)
    .eq("item_id", itemId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin.from("dashboard_pins").delete().eq("id", existing.id)
    if (error) return { error: error.message }
    revalidatePath("/dashboard")
    return { pinned: false }
  }

  const { data: first } = await admin
    .from("dashboard_pins")
    .select("sort_order")
    .eq("user_id", access.userId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  const { error } = await admin.from("dashboard_pins").insert({
    user_id: access.userId,
    item_kind: kind,
    item_id: itemId,
    sort_order: (typeof first?.sort_order === "number" ? first.sort_order : 0) - 1,
  })
  if (error) return { error: error.message }
  revalidatePath("/dashboard")
  return { pinned: true }
}

export async function reorderDashboardPins(ordered: DashboardPin[]) {
  const access = await requireUserId()
  if ("error" in access) return { error: access.error }

  const admin = createAdminClient()
  const { data: existing, error: loadError } = await admin
    .from("dashboard_pins")
    .select("id, item_kind, item_id, sort_order")
    .eq("user_id", access.userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
  if (loadError) return { error: loadError.message }

  const rows = existing ?? []
  const byKey = new Map(rows.map((row) => [`${row.item_kind}:${row.item_id}`, row]))
  const seen = new Set<string>()
  const updates: Array<{ id: string; sort_order: number }> = []
  let sortOrder = 0

  for (const item of ordered) {
    const key = `${item.kind}:${item.id}`
    const row = byKey.get(key)
    if (!row || seen.has(key)) continue
    seen.add(key)
    updates.push({ id: row.id, sort_order: sortOrder })
    sortOrder += 1
  }
  for (const row of rows) {
    const key = `${row.item_kind}:${row.item_id}`
    if (seen.has(key)) continue
    updates.push({ id: row.id, sort_order: sortOrder })
    sortOrder += 1
  }

  for (const update of updates) {
    const { error } = await admin
      .from("dashboard_pins")
      .update({ sort_order: update.sort_order })
      .eq("id", update.id)
      .eq("user_id", access.userId)
    if (error) return { error: error.message }
  }

  revalidatePath("/dashboard")
  return { success: true }
}
