/**
 * Phase 9.3 — playbook-selectable model tiers.
 * Defaults match current Agora behaviour; playbook_versions.config overrides.
 */

import { z } from "zod"

export const MODEL_TASKS = ["chat", "draft", "measures", "qc"] as const
export type ModelTask = (typeof MODEL_TASKS)[number]

export const citationModeSchema = z.enum(["standard", "strict"])
export type CitationMode = z.infer<typeof citationModeSchema>

export const playbookModelTiersSchema = z.object({
  chat: z.string().min(1).default("gpt-4o-mini"),
  draft: z.string().min(1).default("gpt-4o-mini"),
  measures: z.string().min(1).default("gpt-4o-mini"),
  qc: z.string().min(1).default("gpt-4o"),
  /** Optional higher-accuracy chat model for document preview quoting */
  chatPreview: z.string().min(1).default("gpt-4o"),
})

export type PlaybookModelTiers = z.infer<typeof playbookModelTiersSchema>

export const playbookRuntimeConfigSchema = z.object({
  models: playbookModelTiersSchema.default({}),
  citationMode: citationModeSchema.default("standard"),
})

export type PlaybookRuntimeConfig = z.infer<typeof playbookRuntimeConfigSchema>

export const DEFAULT_MODEL_TIERS: PlaybookModelTiers = playbookModelTiersSchema.parse({})

export const DEFAULT_PLAYBOOK_RUNTIME_CONFIG: PlaybookRuntimeConfig = playbookRuntimeConfigSchema.parse({})

/**
 * Parse playbook_versions.config jsonb. Invalid/partial configs fall back to defaults per field.
 */
export function parsePlaybookRuntimeConfig(raw: unknown): PlaybookRuntimeConfig {
  const result = playbookRuntimeConfigSchema.safeParse(raw ?? {})
  if (result.success) return result.data

  // Field-level salvage
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const modelsRaw = obj.models && typeof obj.models === "object" && !Array.isArray(obj.models) ? obj.models : {}
  const models = playbookModelTiersSchema.parse({
    ...DEFAULT_MODEL_TIERS,
    ...(modelsRaw as Record<string, unknown>),
  })
  const citationMode = citationModeSchema.safeParse(obj.citationMode)
  return {
    models,
    citationMode: citationMode.success ? citationMode.data : "standard",
  }
}

export function resolveModelForTask(
  task: ModelTask,
  config?: PlaybookRuntimeConfig | null,
  options?: { isDocumentPreview?: boolean },
): string {
  const models = config?.models ?? DEFAULT_MODEL_TIERS
  if (task === "chat" && options?.isDocumentPreview) {
    return models.chatPreview
  }
  return models[task]
}
