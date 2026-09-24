import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { HELP_SYSTEM_PROMPT } from "@/lib/guidance/help-corpus"
import {
  ANALYSIS_IDENTITY,
  CHAT_IDENTITY,
  DEFAULT_ANALYSIS_PLAYBOOK,
  DEFAULT_CHAT_PLAYBOOK,
  DEFAULT_DRAFT_PLAYBOOK,
  DEFAULT_MEASURES_PLAYBOOK,
  DEFAULT_OER_PLAYBOOK,
  DEFAULT_QC_PLAYBOOK,
  DEFAULT_VISION_PLAYBOOK,
  DRAFT_IDENTITY,
  MEASURES_IDENTITY,
  OER_IDENTITY,
  QC_IDENTITY,
  VISION_IDENTITY,
  type PromptKind,
} from "@/lib/chat/playbook-compiler"

export type PlatformPromptGroup = "tools" | "playbooks" | "identity" | "agents"

export type PlatformPromptDef = {
  id: string
  groupId: PlatformPromptGroup
  label: string
  body: string
}

export const PLATFORM_PROMPT_DEFS: PlatformPromptDef[] = [
  { id: "help", groupId: "tools", label: "Help", body: HELP_SYSTEM_PROMPT },
  {
    id: "summarize",
    groupId: "tools",
    label: "Document summary",
    body: `You are a document summarization assistant. Create a concise, informative summary of the document content.

Rules:
- Write 1-2 sentences (max 150 characters)
- Focus on the main topic, purpose, or key information
- Use clear, professional language
- If the document title is provided, incorporate it naturally
- Do not include meta-commentary like "This document discusses..." - just state the information directly`,
  },
  {
    id: "query_rewrite",
    groupId: "tools",
    label: "Search query rewrite",
    body: `You are a query rewriting assistant. Rewrite user questions into better search queries that will find relevant information in documents.

Rules:
- Extract key concepts, entities, and important terms from the question
- Remove question words (what, which, how, etc.) and convert to searchable terms
- Include synonyms or related terms that might appear in documents
- Keep it concise (1-3 key phrases, max 20 words)
- Focus on nouns and important verbs, remove filler words`,
  },
  {
    id: "overheid_search",
    groupId: "tools",
    label: "Overheid.nl query generator",
    body: `You are a search query generator for Dutch government documents. Convert workspace scope descriptions into effective search queries for Overheid.nl APIs.

Rules:
- Generate 3-5 distinct search queries that would find relevant Dutch government documents
- Each query should focus on different aspects or keywords from the scope
- Use Dutch government terminology and official document types
- Keep queries concise (2-5 key terms each)
- Include location-specific terms if location is provided
- Return a JSON object with a "queries" array of strings`,
  },
  {
    id: "overheid_rank",
    groupId: "tools",
    label: "Overheid.nl result ranking",
    body: `You are a relevance ranking assistant. Rank search results by how relevant they are to a workspace scope.

Rules:
- Score each result from 0.0 to 1.0 based on relevance
- 1.0 = highly relevant, directly matches the scope
- 0.5 = somewhat relevant, related topic
- 0.0 = not relevant
- Consider title, description, and type when scoring
- Return a JSON object with identifiers/titles as keys and scores as values`,
  },
  {
    id: "chat_title",
    groupId: "tools",
    label: "Conversation title",
    body: `Write a short conversation title (max 8 words) for the user's question. Return only the title, no quotes.`,
  },
  {
    id: "enhance_summary",
    groupId: "tools",
    label: "Enhance authority summary",
    body: `You are a helpful assistant that writes clear, concise mission statements for policy initiatives.

The mission statement you return should:
- Be very brief and concise (1-2 sentences maximum)
- Capture the core purpose and mandate of the initiative
- Stay faithful to the original meaning
- Use neutral, professional language
- Be suitable as a high-level summary

Return ONLY the mission statement text, nothing else.`,
  },
  {
    id: "enhance_description",
    groupId: "tools",
    label: "Enhance authority description",
    body: `You are a helpful assistant that writes clear, comprehensive descriptions for policy initiatives.

The description you return should:
- Be longer than the mission statement but still concise (4-6 sentences)
- Expand with specific details about policy domain, stakeholders, and key objectives
- Stay faithful to the original meaning
- Use neutral, professional language
- Not be overly lengthy or verbose

Return ONLY the description text, nothing else.`,
  },
  {
    id: "enhance_workspace",
    groupId: "tools",
    label: "Enhance programme context",
    body: `You are a helpful assistant that enhances workspace context descriptions so search and drafting work better.

Rules:
- Keep the enhanced text concise but comprehensive
- Maintain the original meaning and intent
- Add relevant details that would help with document search and understanding
- Use clear, professional language
- Focus on domain, document types, and key information
- Do not add information that wasn't implied in the original text
- Return only the enhanced text, no explanations`,
  },
  { id: "playbook.chat", groupId: "playbooks", label: "Ask / chat playbook", body: DEFAULT_CHAT_PLAYBOOK },
  { id: "playbook.draft", groupId: "playbooks", label: "Chapter draft playbook", body: DEFAULT_DRAFT_PLAYBOOK },
  { id: "playbook.measures", groupId: "playbooks", label: "Measures playbook", body: DEFAULT_MEASURES_PLAYBOOK },
  { id: "playbook.analysis", groupId: "playbooks", label: "Analysis playbook", body: DEFAULT_ANALYSIS_PLAYBOOK },
  { id: "playbook.vision", groupId: "playbooks", label: "Vision playbook", body: DEFAULT_VISION_PLAYBOOK },
  { id: "playbook.oer", groupId: "playbooks", label: "Effects playbook", body: DEFAULT_OER_PLAYBOOK },
  { id: "playbook.qc", groupId: "playbooks", label: "Quality playbook", body: DEFAULT_QC_PLAYBOOK },
  { id: "identity.chat", groupId: "identity", label: "Ask identity", body: CHAT_IDENTITY },
  { id: "identity.draft", groupId: "identity", label: "Draft identity", body: DRAFT_IDENTITY },
  { id: "identity.measures", groupId: "identity", label: "Measures identity", body: MEASURES_IDENTITY },
  { id: "identity.analysis", groupId: "identity", label: "Analysis identity", body: ANALYSIS_IDENTITY },
  { id: "identity.vision", groupId: "identity", label: "Vision identity", body: VISION_IDENTITY },
  { id: "identity.oer", groupId: "identity", label: "Effects identity", body: OER_IDENTITY },
  { id: "identity.qc", groupId: "identity", label: "Quality identity", body: QC_IDENTITY },
  {
    id: "agent.quality.analysis",
    groupId: "agents",
    label: "Seed: policy analyst quality rules",
    body: "Findings must cite both vision and policy when a contradiction is claimed.",
  },
  {
    id: "agent.quality.vision",
    groupId: "agents",
    label: "Seed: vision specialist quality rules",
    body: "Every measure must have a contribution path.",
  },
  {
    id: "agent.quality.measures",
    groupId: "agents",
    label: "Seed: measures author quality rules",
    body: "Measures of type measure must be specific and cited.",
  },
  {
    id: "agent.quality.oer",
    groupId: "agents",
    label: "Seed: effects specialist quality rules",
    body: "Deviations require justification.",
  },
  {
    id: "agent.quality.qc",
    groupId: "agents",
    label: "Seed: quality controller rules",
    body: "Produce an actionable finding list, not chat.",
  },
  {
    id: "agent.quality.draft",
    groupId: "agents",
    label: "Seed: chapter drafter quality rules",
    body: "Obey the outline node instructions and required flag.",
  },
]

const builtinById = new Map(PLATFORM_PROMPT_DEFS.map((entry) => [entry.id, entry]))

export function builtinPlatformPrompt(id: string): string {
  return builtinById.get(id)?.body ?? ""
}

export function applyPromptLanguage(body: string, language: string): string {
  const lang = language.trim()
  if (!lang) return body
  return `${body}\n\nLANGUAGE REQUIREMENT:\n- Write all prose in ${lang}. This is the authority's writing language.\n- Copy quotations exactly as they appear in the source, even when that language differs.`
}

export async function ensurePlatformPromptSeeds() {
  const admin = createAdminClient()
  const { data } = await admin.from("platform_prompts").select("id")
  const have = new Set((data || []).map((row) => row.id as string))
  const missing = PLATFORM_PROMPT_DEFS.filter((entry) => !have.has(entry.id))
  if (missing.length === 0) return
  await admin.from("platform_prompts").insert(
    missing.map((entry) => ({
      id: entry.id,
      group_id: entry.groupId,
      label: entry.label,
      body: entry.body,
      updated_at: new Date().toISOString(),
    })),
  )
}

export async function getPlatformPrompt(id: string): Promise<string> {
  try {
    await ensurePlatformPromptSeeds()
    const admin = createAdminClient()
    const { data } = await admin.from("platform_prompts").select("body").eq("id", id).maybeSingle()
    if (typeof data?.body === "string" && data.body.trim()) return data.body
  } catch {
    // Fall back to shipped defaults when the table is not migrated yet.
  }
  return builtinPlatformPrompt(id)
}

export type PlatformPromptRow = {
  id: string
  group_id: string
  label: string
  body: string
  updated_at: string | null
}

export async function listPlatformPrompts() {
  await ensurePlatformPromptSeeds()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("platform_prompts")
    .select("id, group_id, label, body, updated_at")
    .order("group_id")
    .order("id")
  if (error) return { error: error.message, data: [] as PlatformPromptRow[] }
  return { data: (data || []) as PlatformPromptRow[] }
}

export async function loadPromptLayers(kind: PromptKind): Promise<{ identity: string; playbook: string }> {
  const [identity, playbook] = await Promise.all([
    getPlatformPrompt(`identity.${kind}`),
    getPlatformPrompt(`playbook.${kind}`),
  ])
  return {
    identity: identity || builtinPlatformPrompt(`identity.${kind}`),
    playbook: playbook || builtinPlatformPrompt(`playbook.${kind}`),
  }
}
