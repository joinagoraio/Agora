/**
 * Phase 0 domain types — shared vocabulary for programme features.
 */

export const WORKSPACE_KINDS = ["research", "environmental_programme"] as const
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number]

export const DOCUMENT_ROLES = [
  "environmental_vision",
  "environmental_effects_report",
  "programme_handbook",
  "existing_policy",
  "housing_programme",
  "quality_style_rules",
  "other",
] as const
export type DocumentRole = (typeof DOCUMENT_ROLES)[number]

export const PRIVILEGED_DOCUMENT_ROLES = [
  "environmental_vision",
  "environmental_effects_report",
  "programme_handbook",
  "quality_style_rules",
  "housing_programme",
] as const satisfies readonly DocumentRole[]

export const AGENT_STAGES = [
  "analysis",
  "vision",
  "measures",
  "oer",
  "qc",
  "draft",
  "chat",
] as const
export type AgentStage = (typeof AGENT_STAGES)[number]

export function isAgentStage(value: unknown): value is AgentStage {
  return typeof value === "string" && (AGENT_STAGES as readonly string[]).includes(value)
}

export type AgentBindings = Partial<Record<AgentStage, string>>

export type ProgrammeBindings = {
  environmentalVisionDocumentIds: string[]
  environmentalEffectsReportDocumentIds: string[]
  programmeHandbookDocumentIds: string[]
  qualityStyleRulesDocumentIds: string[]
  housingProgrammeDocumentIds: string[]
  existingPolicyDocumentIds: string[]
  /** @deprecated Playbooks are legacy storage; use agentBindings. */
  playbookId?: string | null
  templateId?: string | null
  /** Per-stage agent id (analysis, measures, …). */
  agentBindings?: AgentBindings
  /** outline node id → agent id for chapter draft generation */
  chapterAgentBindings?: Record<string, string>
  /** outline node id → workspace document id (chapter drafts) */
  chapterDocuments?: Record<string, string>
}

export function emptyProgrammeBindings(): ProgrammeBindings {
  return {
    environmentalVisionDocumentIds: [],
    environmentalEffectsReportDocumentIds: [],
    programmeHandbookDocumentIds: [],
    qualityStyleRulesDocumentIds: [],
    housingProgrammeDocumentIds: [],
    existingPolicyDocumentIds: [],
    playbookId: null,
    templateId: null,
    agentBindings: {},
    chapterAgentBindings: {},
    chapterDocuments: {},
  }
}

export function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return typeof value === "string" && (WORKSPACE_KINDS as readonly string[]).includes(value)
}

export function isDocumentRole(value: unknown): value is DocumentRole {
  return typeof value === "string" && (DOCUMENT_ROLES as readonly string[]).includes(value)
}

export type DocumentOrigin = "authority" | "uploaded" | "generated" | "published"

export function documentOriginFromMetadata(metadata: unknown): DocumentOrigin {
  const origin =
    metadata && typeof metadata === "object" && metadata !== null
      ? (metadata as Record<string, unknown>).origin
      : null
  if (origin === "space_scope") return "authority"
  if (origin === "workspace_generated") return "generated"
  if (origin === "published_programme") return "published"
  return "uploaded"
}

export function parseProgrammeBindings(metadata: Record<string, unknown> | null | undefined): ProgrammeBindings {
  const raw = (metadata?.programmeBindings ?? {}) as Record<string, unknown>
  const asIds = (v: unknown) =>
    Array.isArray(v) ? v.filter((id): id is string => typeof id === "string" && id.length > 0) : []

  const chapterDocuments: Record<string, string> = {}
  const rawChapters = raw.chapterDocuments
  if (rawChapters && typeof rawChapters === "object" && !Array.isArray(rawChapters)) {
    for (const [nodeId, docId] of Object.entries(rawChapters as Record<string, unknown>)) {
      if (typeof nodeId === "string" && nodeId.length > 0 && typeof docId === "string" && docId.length > 0) {
        chapterDocuments[nodeId] = docId
      }
    }
  }

  const agentBindings: AgentBindings = {}
  const rawAgents = raw.agentBindings
  if (rawAgents && typeof rawAgents === "object" && !Array.isArray(rawAgents)) {
    for (const [stage, agentId] of Object.entries(rawAgents as Record<string, unknown>)) {
      if (isAgentStage(stage) && typeof agentId === "string" && agentId.length > 0) {
        agentBindings[stage] = agentId
      }
    }
  }

  const chapterAgentBindings: Record<string, string> = {}
  const rawChapterAgents = raw.chapterAgentBindings
  if (rawChapterAgents && typeof rawChapterAgents === "object" && !Array.isArray(rawChapterAgents)) {
    for (const [nodeId, agentId] of Object.entries(rawChapterAgents as Record<string, unknown>)) {
      if (typeof nodeId === "string" && nodeId.length > 0 && typeof agentId === "string" && agentId.length > 0) {
        chapterAgentBindings[nodeId] = agentId
      }
    }
  }

  return {
    environmentalVisionDocumentIds: asIds(raw.environmentalVisionDocumentIds),
    environmentalEffectsReportDocumentIds: asIds(raw.environmentalEffectsReportDocumentIds),
    programmeHandbookDocumentIds: asIds(raw.programmeHandbookDocumentIds),
    qualityStyleRulesDocumentIds: asIds(raw.qualityStyleRulesDocumentIds),
    housingProgrammeDocumentIds: asIds(raw.housingProgrammeDocumentIds),
    existingPolicyDocumentIds: asIds(raw.existingPolicyDocumentIds),
    playbookId: typeof raw.playbookId === "string" ? raw.playbookId : null,
    templateId: typeof raw.templateId === "string" ? raw.templateId : null,
    agentBindings,
    chapterAgentBindings,
    chapterDocuments,
  }
}

export function getWorkspaceKind(metadata: Record<string, unknown> | null | undefined): WorkspaceKind {
  const kind = metadata?.kind
  return isWorkspaceKind(kind) ? kind : "research"
}

/** Prefer column `kind`, fall back to metadata.kind (legacy). */
export function resolveWorkspaceKind(workspace: {
  kind?: string | null
  metadata?: Record<string, unknown> | null
}): WorkspaceKind {
  if (isWorkspaceKind(workspace.kind)) return workspace.kind
  return getWorkspaceKind(workspace.metadata ?? null)
}

export function isEnvironmentalProgrammeWorkspace(workspace: {
  kind?: string | null
  metadata?: Record<string, unknown> | null
}): boolean {
  return resolveWorkspaceKind(workspace) === "environmental_programme"
}

export function workspaceHomeHref(workspace: {
  id: string
  kind?: string | null
  metadata?: Record<string, unknown> | null
}): string {
  if (isEnvironmentalProgrammeWorkspace(workspace)) {
    return `/workspaces/${workspace.id}/programme`
  }
  return `/workspaces/${workspace.id}`
}

export const PROGRAMME_WORKBENCH_SECTIONS = [
  "overview",
  "setup",
  "agents",
  "corpus",
  "analysis",
  "outline",
  "editor",
  "measures",
  "effects",
  "provenance",
  "review",
  "export",
] as const

export type ProgrammeWorkbenchSection = (typeof PROGRAMME_WORKBENCH_SECTIONS)[number]

export function isProgrammeWorkbenchSection(value: unknown): value is ProgrammeWorkbenchSection {
  return typeof value === "string" && (PROGRAMME_WORKBENCH_SECTIONS as readonly string[]).includes(value)
}

export type OutlineFieldSpec = {
  key: string
  label: string
  required?: boolean
}

export type ProgrammeOutlineNode = {
  id: string
  templateId: string
  parentId: string | null
  title: string
  purpose: string | null
  /** Per-chapter authoring / agent instructions. */
  instructions: string | null
  fieldSpecs: OutlineFieldSpec[]
  qualityRules: string | null
  outputForm: string | null
  relationHints: string | null
  required: boolean
  sortOrder: number
}

export type ProgrammeTemplate = {
  id: string
  spaceId: string
  name: string
  qualityRules: string | null
  outputForm: string | null
  createdAt: string
}

export type OutlineTreeNode = ProgrammeOutlineNode & { children: OutlineTreeNode[] }

export type OutlineEditorDraft = {
  id?: string
  title: string
  purpose: string
  instructions?: string
  qualityRules?: string
  outputForm?: string
  relationHints?: string
  fieldSpecs?: OutlineFieldSpec[]
  required?: boolean
  sortOrder: number
}

function parseFieldSpecs(raw: unknown): OutlineFieldSpec[] {
  if (!Array.isArray(raw)) return []
  const specs: OutlineFieldSpec[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    if (typeof rec.key !== "string" || !rec.key || typeof rec.label !== "string" || !rec.label) continue
    specs.push({
      key: rec.key,
      label: rec.label,
      required: rec.required === true,
    })
  }
  return specs
}

export function mapOutlineRow(row: {
  id: string
  template_id: string
  parent_id: string | null
  title: string
  purpose: string | null
  instructions?: string | null
  field_specs?: unknown
  quality_rules?: string | null
  output_form?: string | null
  relation_hints?: string | null
  required: boolean
  sort_order: number
}): ProgrammeOutlineNode {
  return {
    id: row.id,
    templateId: row.template_id,
    parentId: row.parent_id,
    title: row.title,
    purpose: row.purpose,
    instructions: row.instructions ?? null,
    fieldSpecs: parseFieldSpecs(row.field_specs),
    qualityRules: row.quality_rules ?? null,
    outputForm: row.output_form ?? null,
    relationHints: row.relation_hints ?? null,
    required: row.required,
    sortOrder: row.sort_order,
  }
}

export function mapTemplateRow(row: {
  id: string
  space_id: string
  name: string
  quality_rules?: string | null
  output_form?: string | null
  created_at: string
}): ProgrammeTemplate {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    qualityRules: row.quality_rules ?? null,
    outputForm: row.output_form ?? null,
    createdAt: row.created_at,
  }
}

/** Build a forest sorted by sortOrder; orphans (missing parent) become roots. */
export function buildOutlineTree(nodes: ProgrammeOutlineNode[]): OutlineTreeNode[] {
  const byId = new Map<string, OutlineTreeNode>()
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] })
  }
  const roots: OutlineTreeNode[] = []
  for (const node of nodes) {
    const current = byId.get(node.id)!
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(current)
    } else {
      roots.push(current)
    }
  }
  const sortRec = (list: OutlineTreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    for (const child of list) sortRec(child.children)
  }
  sortRec(roots)
  return roots
}

export function flattenOutlineTree(tree: OutlineTreeNode[]): ProgrammeOutlineNode[] {
  const out: ProgrammeOutlineNode[] = []
  const walk = (nodes: OutlineTreeNode[]) => {
    for (const node of nodes) {
      const { children, ...rest } = node
      out.push(rest)
      walk(children)
    }
  }
  walk(tree)
  return out
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function outlinePurposePlainText(purpose: string | null | undefined): string {
  if (!purpose) return ""
  return purpose
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .trim()
}

export function moveOutlineNodeId(orderedIds: string[], fromId: string, beforeId: string | null): string[] {
  if (!orderedIds.includes(fromId) || fromId === beforeId) return orderedIds
  const next = orderedIds.filter((id) => id !== fromId)
  if (!beforeId || !next.includes(beforeId)) {
    next.push(fromId)
    return next
  }
  next.splice(next.indexOf(beforeId), 0, fromId)
  return next
}

export function insertOutlineNodeAt(orderedIds: string[], fromId: string, index: number): string[] {
  if (!orderedIds.includes(fromId)) return orderedIds
  const rest = orderedIds.filter((id) => id !== fromId)
  const clamped = Math.max(0, Math.min(index, rest.length))
  return [...rest.slice(0, clamped), fromId, ...rest.slice(clamped)]
}

/** TipTap-friendly HTML: each chapter is H2 (+ optional purpose block). */
export function outlineNodesToTipTapHtml(nodes: ProgrammeOutlineNode[]): string {
  const ordered = flattenOutlineTree(buildOutlineTree(nodes))
  if (ordered.length === 0) {
    return "<h2>New chapter</h2><p></p>"
  }
  return ordered
    .map((node) => {
      const purpose = (node.purpose || "").trim()
      const purposeHtml = purpose
        ? purpose.startsWith("<")
          ? purpose
          : `<p>${escapeHtml(purpose)}</p>`
        : "<p></p>"
      return `<h2 data-outline-id="${escapeHtml(node.id)}">${escapeHtml(node.title)}</h2>${purposeHtml}`
    })
    .join("")
}

/**
 * Parse TipTap HTML into outline drafts (client or happy-dom).
 * Uses DOMParser when available; falls back to a minimal regex parser for Node tests.
 */
export function tipTapHtmlToOutlineDrafts(html: string): OutlineEditorDraft[] {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html || "", "text/html")
    const headings = Array.from(doc.body.querySelectorAll("h1, h2, h3"))
    if (headings.length === 0) return []
    return headings.map((heading, index) => {
      const id = heading.getAttribute("data-outline-id") || undefined
      const title = (heading.textContent || "").trim() || `Section ${index + 1}`
      const parts: string[] = []
      let sibling = heading.nextElementSibling
      while (sibling && !/^H[1-3]$/.test(sibling.tagName)) {
        parts.push(sibling.outerHTML)
        sibling = sibling.nextElementSibling
      }
      return {
        id,
        title,
        purpose: parts.join("") || "<p></p>",
        sortOrder: index + 1,
      }
    })
  }

  // Node fallback for unit tests
  const drafts: OutlineEditorDraft[] = []
  const re = /<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-3]\b|$)/gi
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(html || "")) !== null) {
    const attrs = match[2] || ""
    const idMatch = attrs.match(/data-outline-id=["']([^"']+)["']/i)
    const title = match[3].replace(/<[^>]+>/g, "").trim() || `Section ${index + 1}`
    drafts.push({
      id: idMatch?.[1],
      title,
      purpose: (match[4] || "").trim() || "<p></p>",
      sortOrder: index + 1,
    })
    index += 1
  }
  return drafts
}

export type AgentRecord = {
  id: string
  spaceId: string
  name: string
  role: string
  stage: AgentStage
  permitted: boolean
  createdAt: string
}

export type DefaultSpaceAgentSpec = {
  name: string
  role: string
  stage: AgentStage
  sourceRoles: DocumentRole[]
}

export const DEFAULT_SPACE_AGENTS: readonly DefaultSpaceAgentSpec[] = [
  {
    name: "Policy analyst",
    role: "Existing-policy analysis",
    stage: "analysis",
    sourceRoles: ["environmental_vision", "existing_policy"],
  },
  {
    name: "Vision graph specialist",
    role: "Vision and coverage",
    stage: "vision",
    sourceRoles: ["environmental_vision"],
  },
  {
    name: "Measures author",
    role: "Measure generation",
    stage: "measures",
    sourceRoles: ["environmental_vision", "existing_policy", "housing_programme", "programme_handbook"],
  },
  {
    name: "Effects specialist",
    role: "Environmental effects alignment",
    stage: "oer",
    sourceRoles: ["environmental_effects_report"],
  },
  {
    name: "Quality controller",
    role: "Programme quality control",
    stage: "qc",
    sourceRoles: ["quality_style_rules", "programme_handbook", "environmental_vision"],
  },
  {
    name: "Chapter drafter",
    role: "Structured chapter draft",
    stage: "draft",
    sourceRoles: ["environmental_vision", "programme_handbook", "quality_style_rules"],
  },
]

export function hasAllDefaultSpaceAgents(agents: Array<{ name: string }>): boolean {
  const names = new Set(agents.map((agent) => agent.name))
  return DEFAULT_SPACE_AGENTS.every((spec) => names.has(spec.name))
}

export type AgentVersionRecord = {
  id: string
  agentId: string
  version: number
  instructions: string
  sourceRoles: DocumentRole[]
  sourceDocumentIds: string[]
  outputContract: string
  qualityRules: string
  provider: string
  endpoint: string | null
  credentialsRef: string | null
  catalogModelId: string | null
  model: string
  changelog: string | null
  createdAt: string
}

export type AgentHistoryVersionDeleteReason = "missing" | "only" | null

export function agentHistoryVersionDeleteReason(
  versions: Array<{ id: string }>,
  versionId: string,
): AgentHistoryVersionDeleteReason {
  if (!versions.some((version) => version.id === versionId)) return "missing"
  if (versions.length <= 1) return "only"
  return null
}

export function isLatestAgentHistoryVersion(
  versions: Array<{ id: string; version: number }>,
  versionId: string,
): boolean {
  if (versions.length === 0) return false
  const latest = versions.reduce((max, item) => (item.version > max.version ? item : max), versions[0])
  return latest.id === versionId
}

export function matchingAgentVersionNumber(
  versions: Array<{ version: number; instructions: string; qualityRules: string }>,
  candidate: { instructions: string; qualityRules: string },
): number | null {
  let match: number | null = null
  for (const version of versions) {
    if (
      version.instructions === candidate.instructions &&
      version.qualityRules === candidate.qualityRules &&
      (match == null || version.version > match)
    ) {
      match = version.version
    }
  }
  return match
}

export function emptyAgentBindings(): AgentBindings {
  return {}
}

export function boundAgentId(bindings: ProgrammeBindings, stage: AgentStage): string | null {
  return bindings.agentBindings?.[stage] || null
}

export function boundChapterAgentId(bindings: ProgrammeBindings, outlineNodeId: string | null | undefined): string | null {
  if (!outlineNodeId) return null
  return bindings.chapterAgentBindings?.[outlineNodeId] || null
}

export function resolveDraftAgentId(bindings: ProgrammeBindings, outlineNodeId?: string | null): string | null {
  return boundChapterAgentId(bindings, outlineNodeId) || boundAgentId(bindings, "draft")
}

export function unbindAgentFromProgrammeBindings(
  bindings: ProgrammeBindings,
  agentId: string,
): ProgrammeBindings {
  if (!agentId) return bindings
  const agentBindings: AgentBindings = { ...(bindings.agentBindings || {}) }
  for (const [stage, boundId] of Object.entries(agentBindings)) {
    if (boundId === agentId) delete agentBindings[stage as AgentStage]
  }
  const chapterAgentBindings = { ...(bindings.chapterAgentBindings || {}) }
  for (const [nodeId, boundId] of Object.entries(chapterAgentBindings)) {
    if (boundId === agentId) delete chapterAgentBindings[nodeId]
  }
  return { ...bindings, agentBindings, chapterAgentBindings }
}

export function moveOutlineSibling(
  nodes: ProgrammeOutlineNode[],
  nodeId: string,
  direction: "up" | "down",
): ProgrammeOutlineNode[] {
  const tree = buildOutlineTree(nodes)
  const parentListFor = (list: OutlineTreeNode[]): OutlineTreeNode[] | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === nodeId) return list
      const found = parentListFor(list[i].children)
      if (found) return found
    }
    return null
  }
  const siblings = parentListFor(tree)
  if (!siblings) return nodes
  const index = siblings.findIndex((n) => n.id === nodeId)
  const swapWith = direction === "up" ? index - 1 : index + 1
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return nodes
  const a = siblings[index]
  const b = siblings[swapWith]
  const aOrder = a.sortOrder
  a.sortOrder = b.sortOrder
  b.sortOrder = aOrder
  return flattenOutlineTree(tree).map((n, i) => ({ ...n, sortOrder: n.sortOrder || i + 1 }))
}
