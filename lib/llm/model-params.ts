/** Models that only accept the API default temperature (typically 1). */
const FIXED_SAMPLING_MODEL = /^(gpt-5|o1|o3|o4)([.-]|$)/i

export function modelHasFixedSampling(modelId: string): boolean {
  return FIXED_SAMPLING_MODEL.test(modelId.trim())
}

export function chatCompletionSampling(
  modelId: string,
  temperature?: number,
): { temperature?: number } {
  if (temperature === undefined || modelHasFixedSampling(modelId)) {
    return {}
  }
  return { temperature }
}

export function chatCompletionTokenLimit(
  modelId: string,
  maxTokens?: number,
): { max_tokens?: number; max_completion_tokens?: number } {
  if (maxTokens === undefined) {
    return {}
  }
  if (modelHasFixedSampling(modelId)) {
    return { max_completion_tokens: maxTokens }
  }
  return { max_tokens: maxTokens }
}
