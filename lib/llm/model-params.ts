/** Models that only accept the API default temperature (typically 1). */
const FIXED_SAMPLING_MODEL = /^(openai\/)?(gpt-[5-9]|o\d)([.-]|$)/i

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

/** Which request setting a provider rejected, read from its error body. */
export function rejectedCompletionParameter(detail: string): "max_tokens" | "temperature" | null {
  if (!/unsupported_parameter|unsupported_value|not supported/i.test(detail)) return null
  if (/max_tokens/.test(detail)) return "max_tokens"
  if (/temperature/.test(detail)) return "temperature"
  return null
}
