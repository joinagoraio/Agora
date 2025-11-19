const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /ignore (all|any|the previous)/i, reason: "Attempts to override earlier instructions" },
  { pattern: /disregard (.+?)instructions/i, reason: "Requests to disregard safety or system prompts" },
  { pattern: /system (?:prompt|instructions)/i, reason: "Tries to access or modify the system prompt" },
  { pattern: /pretend to be/i, reason: "Asks the model to impersonate other roles" },
  { pattern: /(exfiltrate|leak|steal) (data|information|context)/i, reason: "Data exfiltration attempt" },
  { pattern: /(format|wipe|delete).*(log|memory|instructions)/i, reason: "Malicious destructive instruction" },
  { pattern: /(disable|bypass).*(safety|guardrail|policy)/i, reason: "Attempts to disable safety mechanisms" },
  { pattern: /(BEGIN|START) PROMPT INJECTION/i, reason: "Explicit prompt injection marker" },
  { pattern: /base64/i, reason: "Potential encoded payload" },
]

export type PromptInjectionAnalysis = {
  flagged: boolean
  severity: "low" | "medium" | "high"
  reasons: string[]
}

export function analyzePromptInjection(
  userMessage: string,
  context: string,
): PromptInjectionAnalysis {
  const combined = `${userMessage}\n${context}`.toLowerCase()
  const reasons = PROMPT_INJECTION_PATTERNS.filter(({ pattern }) => pattern.test(combined)).map(
    ({ reason }) => reason,
  )

  // Additional heuristic: large number of URLs or HTML tags may indicate payload injection
  const urlMatches = combined.match(/https?:\/\//g)?.length ?? 0
  if (urlMatches >= 5) {
    reasons.push("Excessive external URLs detected")
  }

  let severity: PromptInjectionAnalysis["severity"] = "low"
  if (reasons.length >= 3) {
    severity = "high"
  } else if (reasons.length === 2) {
    severity = "medium"
  }

  return {
    flagged: reasons.length > 0,
    severity,
    reasons,
  }
}

