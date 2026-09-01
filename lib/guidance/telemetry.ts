export type GuidanceTelemetryEvent =
  | "guidance_mode_toggle"
  | "coach_reopen"
  | "help_refusal"
  | "help_ask"
  | "expert_prompt_dismiss"

export const GUIDANCE_TELEMETRY_EVENTS = [
  "guidance_mode_toggle",
  "coach_reopen",
  "help_refusal",
  "help_ask",
  "expert_prompt_dismiss",
] as const

export type GuidanceTelemetryPayload = {
  event: GuidanceTelemetryEvent
  job?: string
  mode?: string
  section?: string
}

const FORBIDDEN_TELEMETRY_KEYS = ["text", "body", "message", "content", "quote", "policy"] as const

function asTrimmed(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : undefined
}

export function sanitizeGuidanceTelemetry(input: unknown): GuidanceTelemetryPayload | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const row = input as Record<string, unknown>
  if (!(GUIDANCE_TELEMETRY_EVENTS as readonly string[]).includes(String(row.event))) return null
  const smuggled = FORBIDDEN_TELEMETRY_KEYS.some((key) => typeof row[key] === "string" && row[key].trim().length > 0)
  if (smuggled) return null
  return {
    event: row.event as GuidanceTelemetryEvent,
    job: asTrimmed(row.job, 40),
    mode: asTrimmed(row.mode, 20),
    section: asTrimmed(row.section, 40),
  }
}

export async function trackGuidanceEvent(payload: GuidanceTelemetryPayload): Promise<void> {
  const sanitized = sanitizeGuidanceTelemetry(payload)
  if (!sanitized) return
  try {
    const { fetchCsrfToken } = await import("@/lib/utils/csrf")
    const token = await fetchCsrfToken()
    await fetch("/api/guidance/telemetry", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(sanitized),
    })
  } catch {
    // Telemetry must never block the coach.
  }
}
