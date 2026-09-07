"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { mapTenantMemberRole, mapTenantRow } from "@/lib/tenant/membership"
import { isTenantAdminRole, type TenantMembership } from "@/lib/tenant/domain"
import { ensureSuperAdminFromEnv } from "@/lib/llm/resolve"

export async function getUserTenantMemberships(): Promise<{
  data: TenantMembership[]
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Unauthorized" }

  await ensureSuperAdminFromEnv(user.id, user.email)

  const { data, error } = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenants(id, name, llm_key_policy, llm_access_policy)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (error) return { data: [], error: error.message }

  return {
    data: (data || []).map((row) => {
      const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
      return {
        tenantId: row.tenant_id,
        role: mapTenantMemberRole(row.role),
        tenant: tenant ? mapTenantRow(tenant) : undefined,
      }
    }),
  }
}

export async function getPrimaryTenantForUser() {
  const result = await getUserTenantMemberships()
  if (result.error) return { data: null, error: result.error }
  const adminMembership = result.data.find((entry) => isTenantAdminRole(entry.role))
  return { data: adminMembership ?? result.data[0] ?? null }
}

export async function getTenantForSpace(spaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("spaces")
    .select("tenant_id, tenants(id, name, llm_key_policy, llm_access_policy)")
    .eq("id", spaceId)
    .maybeSingle()
  if (error || !data?.tenant_id) return { data: null, error: error?.message || "Tenant not found" }
  const tenant = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants
  return { data: tenant ? mapTenantRow(tenant) : null }
}

export async function ensureTenantForUser(userId: string, displayName: string) {
  const admin = createAdminClient()
  const existing = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing.data?.tenant_id) return { tenantId: existing.data.tenant_id }

  const { data: tenant, error } = await admin
    .from("tenants")
    .insert({ name: `${displayName} organisation`, llm_key_policy: "platform_only", llm_access_policy: "global" })
    .select("id")
    .single()
  if (error || !tenant) throw new Error(error?.message || "Failed to create tenant")

  await admin.from("tenant_members").insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: "owner",
  })

  const { data: models } = await admin
    .from("llm_models")
    .select("id")
    .eq("enabled", true)
    .eq("default_for_tenants", true)
  if (models?.length) {
    await admin.from("tenant_llm_settings").upsert(
      models.map((model) => ({ tenant_id: tenant.id, model_id: model.id, enabled: true })),
      { onConflict: "tenant_id,model_id" },
    )
  }

  return { tenantId: tenant.id }
}

export async function listTenantAuthorities(tenantId: string): Promise<{
  data: Array<{ id: string; name: string }>
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Unauthorized" }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!isTenantAdminRole(membership?.role)) return { data: [], error: "Forbidden" }

  const admin = createAdminClient()
  const { data, error } = await admin.from("spaces").select("id, name").eq("tenant_id", tenantId).order("name")
  if (error) return { data: [], error: error.message }
  return { data: (data || []).map((row) => ({ id: row.id as string, name: row.name as string })) }
}

export async function getUserAdminMenuState(): Promise<{
  data: { isTenantAdmin: boolean; isSuperAdmin: boolean }
  error?: string
}> {
  const memberships = await getUserTenantMemberships()
  if (memberships.error) return { data: { isTenantAdmin: false, isSuperAdmin: false }, error: memberships.error }
  const isTenantAdmin = memberships.data.some((entry) => isTenantAdminRole(entry.role))
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const superAdmin = user ? await import("@/lib/llm/resolve").then((m) => m.isSuperAdmin(user.id)) : false
  return { data: { isTenantAdmin, isSuperAdmin: superAdmin } }
}

export async function updateTenantName(tenantId: string, name: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  if (!name.trim()) return { error: "Name is required" }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!isTenantAdminRole(membership?.role)) return { error: "Forbidden" }

  const { error } = await supabase.from("tenants").update({ name: name.trim() }).eq("id", tenantId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateTenantKeyPolicy(_tenantId: string, _policy: "platform_only" | "allow_byok") {
  return { error: "Only a platform administrator can change the organisation key policy." }
}
