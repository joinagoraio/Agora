import type { TenantLlmAccessPolicy, TenantLlmKeyPolicy } from "@/lib/llm/catalog"

export type { TenantLlmAccessPolicy, TenantLlmKeyPolicy }

export type TenantMemberRole = "owner" | "admin" | "member"

export type PlatformRole = "super_admin"

export type TenantRecord = {
  id: string
  name: string
  llmKeyPolicy: TenantLlmKeyPolicy
  llmAccessPolicy: TenantLlmAccessPolicy
}

export type TenantMembership = {
  tenantId: string
  role: TenantMemberRole
  tenant?: TenantRecord
}

export function isTenantAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin"
}
