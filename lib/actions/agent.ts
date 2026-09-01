"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  type AgentRecord,
  type AgentStage,
  type AgentVersionRecord,
  type DocumentRole,
  isAgentStage,
  isDocumentRole,
} from "@/lib/programme/domain"
import { agentCreateSchema, agentVersionPayloadSchema } from "@/lib/programme/structured-artefacts"
import { DEFAULT_ANALYSIS_PLAYBOOK, DEFAULT_MEASURES_PLAYBOOK, DEFAULT_OER_PLAYBOOK, DEFAULT_QC_PLAYBOOK, DEFAULT_VISION_PLAYBOOK, DEFAULT_DRAFT_PLAYBOOK } from "@/lib/chat/playbook-compiler"

function mapAgent(row: {
  id: string
  space_id: string
  name: string
  role: string
  stage: string
  created_at: string
}): AgentRecord {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    role: row.role,
    stage: (isAgentStage(row.stage) ? row.stage : "draft") as AgentStage,
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
    model: row.model,
    changelog: row.changelog,
    createdAt: row.created_at,
  }
}

const VERSION_SELECT =
  "id, agent_id, version, instructions, source_roles, source_document_ids, output_contract, quality_rules, provider, endpoint, credentials_ref, model, changelog, created_at"

export async function listSpaceAgents(spaceId: string): Promise<{
  data: Array<AgentRecord & { latestVersion: AgentVersionRecord | null }>
  error?: string
}> {
  const supabase = await createClient()
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, space_id, name, role, stage, created_at")
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
    .select("id, space_id, name, role, stage, created_at")
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
}) {
  try {
    await requireAuthAndPermission("space:update", { spaceId: input.spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const parsed = agentVersionPayloadSchema.safeParse(input.payload)
  if (!parsed.success) return { error: parsed.error.errors.map((e) => e.message).join("; ") }

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
  return publishAgentVersion({
    spaceId,
    agentId,
    payload: {
      instructions: current.data.instructions,
      sourceRoles: current.data.sourceRoles,
      sourceDocumentIds: current.data.sourceDocumentIds,
      outputContract: current.data.outputContract,
      qualityRules: current.data.qualityRules,
      provider: current.data.provider,
      endpoint: current.data.endpoint,
      credentialsRef: current.data.credentialsRef,
      model: current.data.model,
      changelog: `Rollback to v${current.data.version}`,
    },
  })
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
    .select("id, space_id, name, role, stage, created_at")
    .single()
  if (error || !data) return { error: error?.message || "Update failed" }
  return { data: mapAgent(data) }
}

type DefaultAgentSpec = {
  name: string
  role: string
  stage: AgentStage
  instructions: string
  sourceRoles: DocumentRole[]
  provider: string
  model: string
  qualityRules: string
}

const DEFAULT_AGENTS: DefaultAgentSpec[] = [
  {
    name: "Policy analyst",
    role: "Existing-policy analysis",
    stage: "analysis",
    instructions: DEFAULT_ANALYSIS_PLAYBOOK,
    sourceRoles: ["environmental_vision", "existing_policy"],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    qualityRules: "Findings must cite both vision and policy when a contradiction is claimed.",
  },
  {
    name: "Policy analyst (OpenAI-compatible)",
    role: "Existing-policy analysis",
    stage: "analysis",
    instructions: DEFAULT_ANALYSIS_PLAYBOOK,
    sourceRoles: ["environmental_vision", "existing_policy"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    qualityRules: "Findings must cite both vision and policy when a contradiction is claimed.",
  },
  {
    name: "Vision graph specialist",
    role: "Vision and coverage",
    stage: "vision",
    instructions: DEFAULT_VISION_PLAYBOOK,
    sourceRoles: ["environmental_vision"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    qualityRules: "Every measure must have a contribution path.",
  },
  {
    name: "Measures author",
    role: "Measure generation",
    stage: "measures",
    instructions: DEFAULT_MEASURES_PLAYBOOK,
    sourceRoles: ["environmental_vision", "existing_policy", "housing_programme", "programme_handbook"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    qualityRules: "Measures of type measure must be specific and cited.",
  },
  {
    name: "Effects specialist",
    role: "OER alignment",
    stage: "oer",
    instructions: DEFAULT_OER_PLAYBOOK,
    sourceRoles: ["environmental_effects_report"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    qualityRules: "Deviations require justification.",
  },
  {
    name: "Quality controller",
    role: "Programme QC",
    stage: "qc",
    instructions: DEFAULT_QC_PLAYBOOK,
    sourceRoles: ["quality_style_rules", "programme_handbook", "environmental_vision"],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    qualityRules: "Produce an actionable finding list, not chat.",
  },
  {
    name: "Quality controller (OpenAI-compatible)",
    role: "Programme QC",
    stage: "qc",
    instructions: DEFAULT_QC_PLAYBOOK,
    sourceRoles: ["quality_style_rules", "programme_handbook", "environmental_vision"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    qualityRules: "Produce an actionable finding list, not chat.",
  },
  {
    name: "Chapter drafter",
    role: "Structured chapter draft",
    stage: "draft",
    instructions: DEFAULT_DRAFT_PLAYBOOK,
    sourceRoles: ["environmental_vision", "programme_handbook", "quality_style_rules"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    qualityRules: "Obey the outline node instructions and required flag.",
  },
]

/** Idempotent default specialists. Safe to call twice. */
export async function seedDefaultSpaceAgents(spaceId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const existing = await listSpaceAgents(spaceId)
  if (existing.error) return { error: existing.error }
  const byName = new Set(existing.data.map((a) => a.name))
  const byStage = new Map(existing.data.map((a) => [a.stage, a]))
  const created: AgentRecord[] = []

  for (const spec of DEFAULT_AGENTS) {
    if (byName.has(spec.name)) continue
    const result = await createAgent({
      spaceId,
      name: spec.name,
      role: spec.role,
      stage: spec.stage,
      version: {
        instructions: spec.instructions,
        sourceRoles: spec.sourceRoles,
        model: spec.model,
        provider: spec.provider,
        qualityRules: spec.qualityRules,
        outputContract: spec.stage === "draft" ? "prose" : "json",
        changelog: "Seeded default specialist",
      },
    })
    if (result.error || !result.data) return { error: result.error || "Seed agent failed" }
    created.push(result.data.agent)
    byName.add(spec.name)
    byStage.set(spec.stage, { ...result.data.agent, latestVersion: result.data.version })
  }

  return { data: { agents: [...byStage.values()], createdCount: created.length } }
}
