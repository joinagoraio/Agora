import "server-only"

export const SPEECH_MODEL = "gpt-4o-mini-tts"
export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"

/** OpenAI's own estimate for gpt-4o-mini-tts, in US dollars per minute of speech. */
export const SPEECH_USD_PER_MINUTE = 0.015
/** The mp3 files OpenAI returns are 128 kbit/s: 16 000 bytes per second. */
export const MP3_BYTES_PER_SECOND = 16000
/** gpt-4o-mini-transcribe, US dollars per million tokens. */
const TRANSCRIBE_PRICE = { input: 1.25, output: 5 }

export function speechCostUsd(audioBytes: number) {
  return (audioBytes / MP3_BYTES_PER_SECOND / 60) * SPEECH_USD_PER_MINUTE
}

export async function synthesizeSpeech(apiKey: string, input: { voice: string; instructions: string; text: string }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      voice: input.voice,
      input: input.text,
      instructions: input.instructions,
      response_format: "mp3",
    }),
  })
  if (!response.ok) throw new Error(`Speech failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function transcribeSpeech(apiKey: string, audio: Blob, language: "nl" | "en") {
  const form = new FormData()
  form.append("file", audio, audio instanceof File && audio.name ? audio.name : "question.webm")
  form.append("model", TRANSCRIBE_MODEL)
  form.append("language", language)
  form.append("response_format", "json")
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  const data = (await response.json().catch(() => null)) as {
    text?: string
    usage?: { input_tokens?: number; output_tokens?: number }
    error?: { message?: string }
  } | null
  if (!response.ok || typeof data?.text !== "string") {
    throw new Error(data?.error?.message || `Transcription failed (${response.status})`)
  }
  const inputTokens = data.usage?.input_tokens ?? 0
  const outputTokens = data.usage?.output_tokens ?? 0
  return {
    text: data.text.trim(),
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * TRANSCRIBE_PRICE.input + outputTokens * TRANSCRIBE_PRICE.output) / 1_000_000,
  }
}
