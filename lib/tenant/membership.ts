import type { TenantLlmAccessPolicy, TenantLlmKeyPolicy, TenantMemberRole } from "@/lib/tenant/domain"
import { mapLegacyKeyPolicy } from "@/lib/llm/catalog"

export function mapTenantRow(row: {
  id: string
  name: string
  llm_key_policy?: string | null
  llm_access_policy?: string | null
}) {
  return {
    id: row.id,
    name: row.name,
    llmKeyPolicy: (row.llm_key_policy === "allow_byok" ? "allow_byok" : "platform_only") as TenantLlmKeyPolicy,
    llmAccessPolicy: mapLegacyKeyPolicy(row.llm_access_policy || row.llm_key_policy) as TenantLlmAccessPolicy,
  }
}

export function mapTenantMemberRole(role: string): TenantMemberRole {
  if (role === "owner" || role === "admin") return role
  return "member"
}
