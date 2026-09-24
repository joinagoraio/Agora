"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  type AgentRecord,
  type AgentStage,
  type AgentVersionRecord,
  type DocumentRole,
  DEFAULT_SPACE_AGENTS,
  agentHistoryVersionDeleteReason,
  isAgentStage,
  isDocumentRole,
  matchingAgentVersionNumber,
  parseProgrammeBindings,
  unbindAgentFromProgrammeBindings,
} from "@/lib/programme/domain"
import { agentCreateSchema, agentVersionPayloadSchema } from "@/lib/programme/structured-artefacts"
import { getPlatformPrompt } from "@/lib/llm/prompts"
import { getTenantIdForSpace } from "@/lib/llm/resolve"
import { listAuthorityModels } from "@/lib/actions/tenant-llm"
import { providerAdapterId } from "@/lib/llm/catalog"

function mapAgent(row: {
  id: string
  space_id: string
  name: string
  role: string
  stage: string
  permitted?: boolean | null
  created_at: string
}): AgentRecord {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    role: row.role,
    stage: (isAgentStage(row.stage) ? row.stage : "draft") as AgentStage,
    permitted: row.permitted !== false,
    createdAt: row.created_at,
  }
}

function mapVersion(row: {
  id: string
  agent_id: string
  version: number
  instructions: string
  source_roles: string[] | null
  source_document_ids: string[] | null
  output_contract: string
  quality_rules: string
  provider: string
  endpoint: string | null
  credentials_ref: string | null
  catalog_model_id?: string | null
  model: string
  changelog: string | null
  created_at: string
}): AgentVersionRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    version: row.version,
    instructions: row.instructions,
    sourceRoles: (row.source_roles || []).filter(isDocumentRole),
    sourceDocumentIds: row.source_document_ids || [],
    outputContract: row.output_contract,
    qualityRules: row.quality_rules,
    provider: row.provider,
    endpoint: row.endpoint,
    credentialsRef: row.credentials_ref,
    catalogModelId: row.catalog_model_id ?? null,
    model: row.model,
    changelog: row.changelog,
    createdAt: row.created_at,
  }
}

const VERSION_SELECT =
  "id, agent_id, version, instructions, source_roles, source_document_ids, output_contract, quality_rules, provider, endpoint, credentials_ref, catalog_model_id, model, changelog, created_at"

const AGENT_SELECT = "id, space_id, name, role, stage, permitted, created_at"

export async function listSpaceAgents(spaceId: string): Promise<{
  data: Array<AgentRecord & { latestVersion: AgentVersionRecord | null }>
  error?: string
}> {
  const supabase = await createClient()
  const { data: agents, error } = await supabase
    .from("agents")
    .select(AGENT_SELECT)
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true })
  if (error) return { error: error.message, data: [] }

  const mapped = (agents || []).map(mapAgent)
  const withVersions: Array<AgentRecord & { latestVersion: AgentVersionRecord | null }> = []
  for (const agent of mapped) {
    const latest = await getLatestAgentVersion(agent.id)
    withVersions.push({ ...agent, latestVersion: latest.data })
  }
  return { data: withVersions }
}

export async function listAgentVersions(agentId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("agent_versions")
    .select(VERSION_SELECT)
    .eq("agent_id", agentId)
    .order("version", { ascending: false })
  if (error) return { error: error.message, data: [] as AgentVersionRecord[] }
  return { data: (data || []).map(mapVersion) }
}

export async function getLatestAgentVersion(agentId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("agent_versions")
    .select(VERSION_SELECT)
    .eq("agent_id", agentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { error: error.message, data: null }
  return { data: data ? mapVersion(data) : null }
}

export async function getAgentVersionById(versionId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("agent_versions").select(VERSION_SELECT).eq("id", versionId).maybeSingle()
  if (error || !data) return { error: error?.message || "Version not found", data: null }
  return { data: mapVersion(data) }
}

export async function createAgent(input: {
  spaceId: string
  name: string
  role: string
  stage: AgentStage
  version: {
    instructions: string
    sourceRoles?: DocumentRole[]
    sourceDocumentIds?: string[]
    outputContract?: string
    qualityRules?: string
    provider?: string
    endpoint?: string | null
    credentialsRef?: string | null
    catalogModelId?: string | null
    model: string
    changelog?: string | null
  }
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const parsed = agentCreateSchema.safeParse({
    name: input.name,
    role: input.role,
    stage: input.stage,
    version: input.version,
  })
  if (!parsed.success) return { error: parsed.error.errors.map((e) => e.message).join("; ") }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      space_id: input.spaceId,
      name: parsed.data.name,
      role: parsed.data.role,
      stage: parsed.data.stage,
      created_by: user?.id ?? null,
    })
    .select(AGENT_SELECT)
    .single()
  if (error || !agent) return { error: error?.message || "Failed to create agent" }

  const { data: version, error: versionError } = await supabase
    .from("agent_versions")
    .insert({
      agent_id: agent.id,
      version: 1,
      instructions: parsed.data.version.instructions,
      source_roles: parsed.data.version.sourceRoles,
      source_document_ids: parsed.data.version.sourceDocumentIds,
      output_contract: parsed.data.version.outputContract,
      quality_rules: parsed.data.version.qualityRules,
      provider: parsed.data.version.provider,
      endpoint: parsed.data.version.endpoint ?? null,
      credentials_ref: parsed.data.version.credentialsRef ?? null,
      catalog_model_id: parsed.data.version.catalogModelId ?? null,
      model: parsed.data.version.model,
      changelog: parsed.data.version.changelog ?? "Initial version",
      created_by: user?.id ?? null,
    })
    .select(VERSION_SELECT)
    .single()
  if (versionError || !version) return { error: versionError?.message || "Failed to publish version" }

  revalidatePath(`/spaces/${input.spaceId}`)
  return { data: { agent: mapAgent(agent), version: mapVersion(version) } }
}

export async function publishAgentVersion(input: {
  spaceId: string
  agentId: string
  payload: unknown
  allowDuplicate?: boolean
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const parsed = agentVersionPayloadSchema.safeParse(input.payload)
  if (!parsed.success) return { error: parsed.error.errors.map((e) => e.message).join("; ") }

  if (!input.allowDuplicate) {
    const listed = await listAgentVersions(input.agentId)
    if (listed.error) return { error: listed.error }
    const duplicate = matchingAgentVersionNumber(listed.data, {
      instructions: parsed.data.instructions,
      qualityRules: parsed.data.qualityRules,
    })
    if (duplicate != null) {
      return { error: `This is a duplicate of version ${duplicate}.` }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const latest = await getLatestAgentVersion(input.agentId)
  const nextVersion = (latest.data?.version ?? 0) + 1

  const { data, error } = await supabase
    .from("agent_versions")
    .insert({
      agent_id: input.agentId,
      version: nextVersion,
      instructions: parsed.data.instructions,
      source_roles: parsed.data.sourceRoles,
      source_document_ids: parsed.data.sourceDocumentIds,
      output_contract: parsed.data.outputContract,
      quality_rules: parsed.data.qualityRules,
      provider: parsed.data.provider,
      endpoint: parsed.data.endpoint ?? null,
      credentials_ref: parsed.data.credentialsRef ?? null,
      catalog_model_id: parsed.data.catalogModelId ?? null,
      model: parsed.data.model,
      changelog: parsed.data.changelog ?? `Version ${nextVersion}`,
      created_by: user?.id ?? null,
    })
    .select(VERSION_SELECT)
    .single()
  if (error || !data) return { error: error?.message || "Publish failed" }
  revalidatePath(`/spaces/${input.spaceId}`)
  return { data: mapVersion(data) }
}

/** Rollback publishes a new version that copies an older body. */
export async function rollbackAgentVersion(spaceId: string, agentId: string, versionId: string) {
  const current = await getAgentVersionById(versionId)
  if (current.error || !current.data) return { error: current.error || "Version not found" }
  if (current.data.agentId !== agentId) return { error: "Version not found" }
  return publishAgentVersion({
    spaceId,
    agentId,
    allowDuplicate: true,
    payload: {
      instructions: current.data.instructions,
      sourceRoles: current.data.sourceRoles,
      sourceDocumentIds: current.data.sourceDocumentIds,
      outputContract: current.data.outputContract,
      qualityRules: current.data.qualityRules,
      provider: current.data.provider,
      endpoint: current.data.endpoint,
      credentialsRef: current.data.credentialsRef,
      catalogModelId: current.data.catalogModelId,
      model: current.data.model,
      changelog: `Rollback to v${current.data.version}`,
    },
  })
}

export async function deleteAgent(spaceId: string, agentId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("space_id", spaceId)
    .maybeSingle()
  if (agentError || !agent) return { error: agentError?.message || "Agent not found" }

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, metadata")
    .eq("space_id", spaceId)
  if (workspaceError) return { error: workspaceError.message }

  for (const workspace of workspaces || []) {
    const metadata = (workspace.metadata as Record<string, unknown> | null) || {}
    const current = parseProgrammeBindings(metadata)
    const next = unbindAgentFromProgrammeBindings(current, agentId)
    if (JSON.stringify(current) === JSON.stringify(next)) continue
    const { error } = await supabase
      .from("workspaces")
      .update({
        metadata: { ...metadata, programmeBindings: next },
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspace.id)
      .eq("space_id", spaceId)
    if (error) return { error: error.message }
    revalidatePath(`/workspaces/${workspace.id}`)
    revalidatePath(`/workspaces/${workspace.id}/programme`)
  }

  const { error } = await supabase.from("agents").delete().eq("id", agentId).eq("space_id", spaceId)
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function deleteAgentVersion(spaceId: string, agentId: string, versionId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("space_id", spaceId)
    .maybeSingle()
  if (agentError || !agent) return { error: agentError?.message || "Agent not found" }

  const listed = await listAgentVersions(agentId)
  if (listed.error) return { error: listed.error }
  const reason = agentHistoryVersionDeleteReason(listed.data, versionId)
  if (reason === "missing") return { error: "Version not found" }
  if (reason === "only") return { error: "Cannot delete the only version" }

  const { error } = await supabase.from("agent_versions").delete().eq("id", versionId).eq("agent_id", agentId)
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function setAgentPermitted(spaceId: string, agentId: string, permitted: boolean) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { error } = await supabase.from("agents").update({ permitted }).eq("id", agentId).eq("space_id", spaceId)
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function updateAgentMeta(input: {
  spaceId: string
  agentId: string
  name?: string
  role?: string
  stage?: AgentStage
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name) patch.name = input.name
  if (input.role) patch.role = input.role
  if (input.stage && isAgentStage(input.stage)) patch.stage = input.stage
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("agents")
    .update(patch)
    .eq("id", input.agentId)
    .eq("space_id", input.spaceId)
    .select(AGENT_SELECT)
    .single()
  if (error || !data) return { error: error?.message || "Update failed" }
  return { data: mapAgent(data) }
}

/** Idempotent default specialists. Safe to call twice. */
export async function seedDefaultSpaceAgents(
  spaceId: string,
  options?: { catalogModelId?: string | null },
) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const existing = await listSpaceAgents(spaceId)
  if (existing.error) return { error: existing.error }
  const byStage = new Map(existing.data.map((a) => [a.stage, a]))
  const created: AgentRecord[] = []

  const tenantId = await getTenantIdForSpace(spaceId)
  if (!tenantId) return { error: "This authority has no organisation." }
  const catalog = await listAuthorityModels(spaceId)
  const catalogModels = (catalog.data || [])
    .map((row) => {
      const model = Array.isArray(row.llm_models) ? row.llm_models[0] : row.llm_models
      if (!model || typeof model !== "object") return null
      const record = model as { id: string; provider_id: string; model_id: string }
      return record
    })
    .filter((row): row is { id: string; provider_id: string; model_id: string } => Boolean(row))
  const preferredId = options?.catalogModelId?.trim() || ""
  const firstModel =
    (preferredId ? catalogModels.find((row) => row.id === preferredId) : null) || catalogModels[0] || null
  if (!firstModel) {
    return { error: "Enable at least one model for this authority before seeding agents." }
  }

  for (const spec of DEFAULT_SPACE_AGENTS) {
    const current = existing.data.find((agent) => agent.name === spec.name)
    if (current) {
      if (current.role !== spec.role || current.stage !== spec.stage) {
        const updated = await updateAgentMeta({
          spaceId,
          agentId: current.id,
          role: spec.role,
          stage: spec.stage,
        })
        if (updated.error || !updated.data) return { error: updated.error || "Update agent failed" }
        byStage.set(spec.stage, { ...current, ...updated.data })
      }
      continue
    }
    const [instructions, qualityRules] = await Promise.all([
      getPlatformPrompt(`playbook.${spec.stage}`),
      getPlatformPrompt(`agent.quality.${spec.stage}`),
    ])
    const result = await createAgent({
      spaceId,
      name: spec.name,
      role: spec.role,
      stage: spec.stage,
      version: {
        instructions,
        sourceRoles: spec.sourceRoles,
        model: firstModel.model_id,
        provider: providerAdapterId(firstModel.provider_id),
        catalogModelId: firstModel.id,
        qualityRules,
        outputContract: spec.stage === "draft" ? "prose" : "json",
        changelog: "Seeded default specialist",
      },
    })
    if (result.error || !result.data) return { error: result.error || "Seed agent failed" }
    created.push(result.data.agent)
    byStage.set(spec.stage, { ...result.data.agent, latestVersion: result.data.version })
  }

  return { data: { agents: [...byStage.values()], createdCount: created.length } }
}
