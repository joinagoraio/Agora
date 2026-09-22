import type { GuidanceJob, GuidanceMode } from "@/lib/guidance/jobs"
import type { GuidancePipelineSnapshot } from "@/lib/guidance/pipeline"

export type ChatPanelTab = "ask" | "guidance"

export type ChatGuidanceConfig = {
  surface: "programme" | "research"
  job: GuidanceJob
  guidanceMode: GuidanceMode
  helpAiEnabled: boolean
  spaceId?: string
  pipeline?: GuidancePipelineSnapshot | null
  section?: string
  documentTitles?: Array<{ title: string; role: string | null }>
  onNavigate?: (section: string, target?: string) => void
  onModeChange?: (mode: GuidanceMode) => void
  reviewComplete?: boolean
  expertPromptDismissed?: boolean
  setupInProgress?: boolean
}
