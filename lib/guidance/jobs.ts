export const SPACE_JOBS = ["administrator", "none"] as const
export type SpaceJob = (typeof SPACE_JOBS)[number]

export const WORKSPACE_JOBS = ["author", "reviewer"] as const
export type WorkspaceJob = (typeof WORKSPACE_JOBS)[number]

export type GuidanceJob = "administrator" | "author" | "reviewer"

export type GuidanceMode = "guided" | "expert"

export function isSpaceJob(value: unknown): value is SpaceJob {
  return value === "administrator" || value === "none"
}

export function isWorkspaceJob(value: unknown): value is WorkspaceJob {
  return value === "author" || value === "reviewer"
}

export function defaultSpaceJobForRole(role: string | null | undefined): SpaceJob {
  if (role === "owner" || role === "admin") return "administrator"
  return "none"
}

export function defaultWorkspaceJobForInvite(job?: string | null): WorkspaceJob {
  return job === "reviewer" ? "reviewer" : "author"
}

export function spaceJobFromInvite(role: string, job?: string | null): SpaceJob {
  if (isSpaceJob(job)) return job
  return defaultSpaceJobForRole(role)
}

export function workspaceJobFromInvite(job?: string | null): WorkspaceJob {
  if (isWorkspaceJob(job)) return job
  return "author"
}

export function effectiveJob(input: {
  spaceJob?: string | null
  workspaceJob?: string | null
  pathname: string
}): GuidanceJob {
  const onOrganisation = input.pathname.includes("/spaces/") && !input.pathname.includes("/workspaces/")
  if (onOrganisation) {
    return input.spaceJob === "administrator" ? "administrator" : "author"
  }
  if (input.pathname.includes("/programme") || input.pathname.includes("/workspaces/")) {
    if (input.workspaceJob === "reviewer") return "reviewer"
    if (input.spaceJob === "administrator" && !input.workspaceJob) return "administrator"
    return "author"
  }
  return input.spaceJob === "administrator" ? "administrator" : "author"
}

export const PROGRAMME_PRIMARY_SECTIONS: Record<GuidanceJob, readonly string[]> = {
  administrator: [
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
  ],
  author: ["overview", "corpus", "analysis", "outline", "editor", "measures", "effects", "review", "export"],
  reviewer: ["overview", "review", "provenance", "editor", "measures", "effects", "export"],
}

export function primaryNavSections(job: GuidanceJob): readonly string[] {
  return PROGRAMME_PRIMARY_SECTIONS[job]
}

export function moreNavSections(job: GuidanceJob, allSections: readonly string[]): string[] {
  const primary = new Set(primaryNavSections(job))
  return allSections.filter((section) => !primary.has(section))
}

export function defaultProgrammeSection(job: GuidanceJob): string {
  if (job === "reviewer") return "review"
  return "editor"
}

export function resolveProgrammeLandingSection(input: {
  sectionParam?: string | null
  job: GuidanceJob
  firstIncompleteSection?: string | null
  guided?: boolean
}): string {
  if (input.sectionParam) return input.sectionParam
  if (input.job === "reviewer") return "review"
  if (input.guided && input.job !== "administrator" && input.firstIncompleteSection) {
    return input.firstIncompleteSection
  }
  return defaultProgrammeSection(input.job)
}

export function canShowProgrammeConfiguration(input: {
  spaceJob?: string | null
  canAccessSettings?: boolean
}): boolean {
  return input.spaceJob === "administrator" || input.canAccessSettings === true
}

export function wouldLeaveLastAdministrator(input: {
  currentJob: string | null | undefined
  nextJob: string | null | undefined
  administratorCount: number
}): boolean {
  if (input.currentJob !== "administrator") return false
  if (input.nextJob === "administrator") return false
  return input.administratorCount <= 1
}
