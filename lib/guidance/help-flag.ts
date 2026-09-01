import { isHelpAiEnabled } from "@/lib/env"

export function isSpaceHelpAiDisabled(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  return (metadata as Record<string, unknown>).helpAiDisabled === true
}

export function resolveHelpAiEnabled(input: {
  envEnabled?: boolean
  spaceHelpAiDisabled?: boolean
}): boolean {
  if (input.spaceHelpAiDisabled) return false
  return input.envEnabled ?? isHelpAiEnabled()
}
