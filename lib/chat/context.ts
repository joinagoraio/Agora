type WorkspaceRecord = {
  name?: string | null
  context?: string | null
  location?: string | null
  description?: string | null
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
    appendWorkspaceContextSection(`Workspace name: ${workspace.name}`)
  }

  const scopeMetadata = (((workspace?.metadata as Record<string, unknown> | null) ?? {}).scope ??
    null) as Record<string, unknown> | null
  const workspaceSummary = workspace?.description ?? undefined
  const workspaceScopeDescription = (scopeMetadata?.description as string | undefined) ?? undefined
  const workspaceScopeTimeframe = (scopeMetadata?.timeframe as string | undefined) ?? undefined

  if (workspace?.context) {
    appendWorkspaceContextSection(`Workspace context:\n${workspace.context}`)
  }
  if (workspace?.location) {
    appendWorkspaceContextSection(`Workspace location: ${workspace.location}`)
  }
  if (workspaceSummary) {
    appendWorkspaceContextSection(`Workspace summary:\n${workspaceSummary}`)
  }
  if (workspaceScopeDescription) {
    appendWorkspaceContextSection(`Workspace description:\n${workspaceScopeDescription}`)
  }
  if (workspaceScopeTimeframe) {
    appendWorkspaceContextSection(`Workspace programme timeframe: ${workspaceScopeTimeframe}`)
  }

  if (space?.name) {
    appendWorkspaceContextSection(`---\n\nParent Space name: ${space.name}`)
  }
  if (space?.description) {
    appendWorkspaceContextSection(`Space mission statement:\n${space.description}`)
  }

  const spaceScopeMetadata = (((space?.metadata as Record<string, unknown> | null) ?? {}).scope ??
    null) as Record<string, unknown> | null
  const spaceScopeDescription = (spaceScopeMetadata?.description as string | undefined) ?? undefined
  const spaceScopeTimeframe = (spaceScopeMetadata?.timeframe as string | undefined) ?? undefined

  if (spaceScopeDescription) {
    appendWorkspaceContextSection(`Space scope details:\n${spaceScopeDescription}`)
  }
  if (spaceScopeTimeframe) {
    appendWorkspaceContextSection(`Space programme timeframe: ${spaceScopeTimeframe}`)
  }

  if (space?.jurisdiction && typeof space.jurisdiction === "object") {
    const jurisdictionValues = Object.values(space.jurisdiction as Record<string, unknown>)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
    if (jurisdictionValues.length > 0) {
      appendWorkspaceContextSection(`Space jurisdiction: ${jurisdictionValues.join(" • ")}`)
    }
  }

  const hasWorkspaceContext = Boolean(
    workspace?.name ||
      workspace?.context ||
      workspace?.location ||
      workspaceSummary ||
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

