export type LlmMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type LlmCompleteInput = {
  provider: string
  endpoint?: string | null
  credentialsRef?: string | null
  apiKey?: string | null
  model: string
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
  json?: boolean
  reasoningEffort?: "low" | "medium" | "high"
  /** Records token use against a programme, so demo and programme costs can be shown. */
  usage?: { workspaceId?: string | null; kind: string }
}

export type LlmCompleteResult = {
  text: string
  provider: string
  model: string
  tokens?: { input: number; output: number }
}

export type LlmAdapter = (input: LlmCompleteInput, apiKey: string) => Promise<LlmCompleteResult>
