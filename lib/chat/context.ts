import { getWorkspaceKind, parseProgrammeBindings } from "@/lib/programme/domain"

type WorkspaceRecord = {
  name?: string | null
  context?: string | null
  location?: string | null
  summary?: string | null
  description?: string | null
  kind?: string | null
  metadata?: Record<string, unknown> | null
}

type SpaceRecord = {
  name?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  jurisdiction?: Record<string, unknown> | null
}

export type WorkspaceContextInput = {
  workspace?: WorkspaceRecord | null
  space?: SpaceRecord | null
  includeDocumentPreviewNotice?: boolean
}

export type WorkspaceContextResult = {
  contextInstructions: string
  workspaceContextSection: string
  hasWorkspaceContext: boolean
}

export function buildWorkspaceContext({
  workspace,
  space,
  includeDocumentPreviewNotice,
}: WorkspaceContextInput): WorkspaceContextResult {
  let contextInstructions = ""
  if (includeDocumentPreviewNotice) {
    contextInstructions =
      "You are currently in document preview mode, viewing a specific document. You can reference specific pages and sections of this document. When mentioning information from the document, you can indicate which page it's on if that information is available in the context."
  }

  let workspaceContextSection = ""
  const appendWorkspaceContextSection = (content: string) => {
    if (!content) return
    workspaceContextSection = workspaceContextSection.length > 0 ? `${workspaceContextSection}\n\n${content}` : content
  }

  if (workspace?.name) {
    appendWorkspaceContextSection(`Programme name: ${workspace.name}`)
  }

  if (workspace) {
    const workspaceKind = workspace.kind ?? getWorkspaceKind(workspace.metadata ?? null)
    appendWorkspaceContextSection(`Programme kind: ${workspaceKind}`)

    if (workspaceKind === "environmental_programme") {
      const bindings = parseProgrammeBindings(workspace.metadata ?? null)
      appendWorkspaceContextSection(
        `Privileged programme bindings (leading frameworks):\n` +
          `- Environmental vision docs: ${bindings.environmentalVisionDocumentIds.join(", ") || "(none)"}\n` +
          `- Environmental effects report docs: ${bindings.environmentalEffectsReportDocumentIds.join(", ") || "(none)"}\n` +
          `- Programme handbook docs: ${bindings.programmeHandbookDocumentIds.join(", ") || "(none)"}\n` +
          `- Quality/style rules docs: ${bindings.qualityStyleRulesDocumentIds.join(", ") || "(none)"}\n` +
          `- Housing programme docs: ${bindings.housingProgrammeDocumentIds.join(", ") || "(none)"}\n` +
          `Treat privileged documents as leading frameworks over supporting policy.`,
      )
    }
  }

  const scopeMetadata = (((workspace?.metadata as Record<string, unknown> | null) ?? {}).scope ??
    null) as Record<string, unknown> | null
  const workspaceSummary = workspace?.summary ?? undefined
  const workspaceDescription = workspace?.description ?? undefined
  const workspaceScopeDescription = (scopeMetadata?.description as string | undefined) ?? undefined
  const workspaceScopeTimeframe = (scopeMetadata?.timeframe as string | undefined) ?? undefined

  if (workspaceSummary) {
    appendWorkspaceContextSection(`Programme summary:\n${workspaceSummary}`)
  }
  if (workspaceDescription) {
    appendWorkspaceContextSection(`Programme description:\n${workspaceDescription}`)
  }
  if (workspace?.context) {
    appendWorkspaceContextSection(`Programme additional AI context:\n${workspace.context}`)
  }
  if (workspace?.location) {
    appendWorkspaceContextSection(`Programme location: ${workspace.location}`)
  }
  if (workspaceScopeDescription) {
    appendWorkspaceContextSection(`Programme scope details:\n${workspaceScopeDescription}`)
  }
  if (workspaceScopeTimeframe) {
    appendWorkspaceContextSection(`Programme timeframe: ${workspaceScopeTimeframe}`)
  }

  if (space?.name) {
    const authorityHeading = workspace
      ? `---\n\nParent authority name: ${space.name}`
      : `Authority name: ${space.name}`
    appendWorkspaceContextSection(authorityHeading)
  }
  if (space?.description) {
    appendWorkspaceContextSection(`Authority mission statement:\n${space.description}`)
  }

  const spaceScopeMetadata = (((space?.metadata as Record<string, unknown> | null) ?? {}).scope ??
    null) as Record<string, unknown> | null
  const spaceScopeDescription = (spaceScopeMetadata?.description as string | undefined) ?? undefined
  const spaceScopeTimeframe = (spaceScopeMetadata?.timeframe as string | undefined) ?? undefined

  if (spaceScopeDescription) {
    appendWorkspaceContextSection(`Authority description:\n${spaceScopeDescription}`)
  }
  if (spaceScopeTimeframe) {
    appendWorkspaceContextSection(`Authority timeframe: ${spaceScopeTimeframe}`)
  }

  if (space?.jurisdiction && typeof space.jurisdiction === "object") {
    const jurisdictionValues = Object.values(space.jurisdiction as Record<string, unknown>)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
    if (jurisdictionValues.length > 0) {
      appendWorkspaceContextSection(`Authority jurisdiction: ${jurisdictionValues.join(" • ")}`)
    }
  }

  const hasWorkspaceContext = Boolean(
    workspace?.name ||
      workspace?.context ||
      workspace?.location ||
      workspaceSummary ||
      workspaceDescription ||
      workspaceScopeDescription ||
      workspaceScopeTimeframe ||
      space?.name ||
      space?.description ||
      spaceScopeDescription ||
      spaceScopeTimeframe ||
      (space?.jurisdiction &&
        typeof space.jurisdiction === "object" &&
        Object.values(space.jurisdiction as Record<string, unknown>).some(
          (v) => typeof v === "string" && v.trim().length > 0,
        )),
  )

  return { contextInstructions, workspaceContextSection, hasWorkspaceContext }
}

export type ChatScopeAwareness = {
  awarenessSection: string
  mentionInstruction: string
}

export function buildChatScopeAwareness(scope: "authority" | "programme"): ChatScopeAwareness {
  if (scope === "authority") {
    return {
      mentionInstruction:
        "  2. The authority properties (always included) - these define the authority name, mission, and jurisdiction\n  3. That you ONLY have access to the shared library files the user has included in the AI Context section - excluded files are not available to you",
      awarenessSection: `CRITICAL CONTEXT AWARENESS - READ CAREFULLY:

You have access to TWO types of context, and it is PARAMOUNT that you understand and respect the distinction:

1. **Authority properties (ALWAYS INCLUDED)**:
   - These are the authority properties (name, mission, jurisdiction) that define this Bevoegd gezag
   - These are ALWAYS available. Never call this a workspace. You are not inside a programme.

2. **Shared library files (USER-CONTROLLED)**:
   - The user explicitly controls which shared library files are included via the "AI Context" section
   - You ONLY have access to the files the user has INCLUDED
   - You MUST NEVER reference, mention, or use information from files the user has EXCLUDED

The document context provided below contains ONLY the shared library files the user has specifically included.

The authority properties provided below are always part of your knowledge.

`,
    }
  }

  return {
    mentionInstruction:
      "  2. The programme and authority properties (always included) - these define the purpose, scope, and jurisdiction of the work\n  3. That you ONLY have access to the documents, notes, and evidence that the user has included in the AI Context section - excluded items are not available to you",
    awarenessSection: `CRITICAL CONTEXT AWARENESS - READ CAREFULLY:

You have access to TWO types of context, and it is PARAMOUNT that you understand and respect the distinction:

1. **Programme and authority properties (ALWAYS INCLUDED)**:
   - These are the programme and parent authority properties (name, description, scope, location, jurisdiction) that define the organizational context
   - These are ALWAYS available. Never call the programme a workspace.

2. **User-Selected Document/Note/Evidence Context (USER-CONTROLLED)**:
   - The user explicitly controls what documents, notes, and evidence items are included in this conversation via the "AI Context" section
   - You ONLY have access to the documents, notes, and evidence that the user has INCLUDED
   - You MUST NEVER reference, mention, or use information from documents, notes, or evidence that the user has EXCLUDED
   - This is PARAMOUNT - the user's choices in the AI Context section must be FULLY respected

The document context provided below contains ONLY the documents, notes, and evidence that the user has specifically included. You must:
- ONLY use information from the documents/notes/evidence provided in the context below
- NEVER reference documents, notes, or evidence that are not in the provided context
- Understand that excluded items are intentionally not available to you
- If asked about something not in your context, explain that it's not included in the current conversation's context

The programme and authority properties provided below are always part of your knowledge. The document/note/evidence context reflects ONLY what the user has chosen to include.

`,
  }
}

