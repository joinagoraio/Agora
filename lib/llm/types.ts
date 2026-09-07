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
}

export type LlmCompleteResult = {
  text: string
  provider: string
  model: string
}

export type LlmAdapter = (input: LlmCompleteInput, apiKey: string) => Promise<LlmCompleteResult>
