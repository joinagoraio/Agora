import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tokenCost } from "@/lib/llm/prices"
import { logger } from "@/lib/utils/logger"

export type UsageRecord = {
  workspaceId?: string | null
  spaceId?: string | null
  kind: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  /** For usage priced by other measures, such as speech length. */
  costUsd?: number | null
}

/** Never throws: a failed usage record must not fail the AI step it describes. */
export async function recordLlmUsage(record: UsageRecord) {
  try {
    const admin = createAdminClient()
    let spaceId = record.spaceId ?? null
    if (!spaceId && record.workspaceId) {
      const { data } = await admin.from("workspaces").select("space_id").eq("id", record.workspaceId).maybeSingle()
      spaceId = (data?.space_id as string | undefined) ?? null
    }
    await admin.from("llm_usage").insert({
      workspace_id: record.workspaceId ?? null,
      space_id: spaceId,
      kind: record.kind,
      provider: record.provider,
      model: record.model,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      cost_usd: record.costUsd ?? tokenCost(record.model, record.inputTokens, record.outputTokens),
    })
  } catch (error) {
    logger.error("[LlmUsage] Could not record usage", error, { kind: record.kind })
  }
}

export type SpaceCost = { totalUsd: number; byKind: Record<string, number>; runs: number; unpriced: number }

/** What the AI work in one authority has cost so far. */
export async function spaceCost(spaceId: string): Promise<SpaceCost> {
  const admin = createAdminClient()
  const { data } = await admin.from("llm_usage").select("kind, cost_usd").eq("space_id", spaceId)
  const result: SpaceCost = { totalUsd: 0, byKind: {}, runs: 0, unpriced: 0 }
  for (const row of data || []) {
    result.runs += 1
    if (row.cost_usd === null) {
      result.unpriced += 1
      continue
    }
    const cost = Number(row.cost_usd)
    result.totalUsd += cost
    result.byKind[row.kind as string] = (result.byKind[row.kind as string] ?? 0) + cost
  }
  return result
}
