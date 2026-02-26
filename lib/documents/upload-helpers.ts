import OpenAI from "openai"
import { env } from "@/lib/env"
import { logger } from "@/lib/utils/logger"

export const PARSER_TIMEOUT_MS = 15_000
export const SUMMARY_TIMEOUT_MS = 8_000

export function stripMarkdown(text: string): string {
  if (!text) return text
  text = text.replace(/^#{1,6}\s+/gm, "")
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1")
  text = text.replace(/\*([^*]+)\*/g, "$1")
  text = text.replace(/__([^_]+)__/g, "$1")
  text = text.replace(/_([^_]+)_/g, "$1")
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
  text = text.replace(/```[\s\S]*?```/g, "")
  text = text.replace(/`([^`]+)`/g, "$1")
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "")
  text = text.replace(/^---$/gm, "")
  text = text.replace(/^\*\*\*$/gm, "")
  text = text.replace(/^[\*\-\+]\s+/gm, "")
  text = text.replace(/^\d+\.\s+/gm, "")
  text = text.replace(/^>\s+/gm, "")
  return text.trim()
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    promise.then(
      (v) => {
        clearTimeout(timeoutId)
        resolve(v)
      },
      (e) => {
        clearTimeout(timeoutId)
        reject(e)
      },
    )
  })
}

export async function generateDocumentSummary(
  content: string,
  title?: string,
  isMarkdown = false,
): Promise<string> {
  if (!env.OPENAI_API_KEY || !content || content.length < 100) {
    const fallback = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
    return isMarkdown ? stripMarkdown(fallback) : fallback
  }
  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
    const processedContent = isMarkdown ? stripMarkdown(content) : content
    const contentSample = processedContent.substring(0, 2000)
    logger.info("[Upload] Generating summary", { contentLength: content.length })
    const response = await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a document summarization assistant. Create a concise, informative summary (1-2 sentences, max 150 characters). Focus on the main topic or key information. Use clear, professional language.${isMarkdown ? " Content is markdown - focus on information, not formatting." : ""}`,
          },
          { role: "user", content: title ? `Document title: ${title}\n\nContent:\n${contentSample}` : `Content:\n${contentSample}` },
        ],
        max_tokens: 60,
        temperature: 0.3,
      }),
      SUMMARY_TIMEOUT_MS,
      "Summary generation timed out",
    )
    const summary = response.choices[0]?.message?.content?.trim()
    if (summary && summary.length > 0 && summary.length <= 200) return summary
  } catch (error) {
    logger.error("[Upload] Error generating summary:", error)
  }
  const fallback = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
  return isMarkdown ? stripMarkdown(fallback) : fallback
}

export function sanitizeContentForDatabase(text: string): string {
  return text.replace(/\0/g, "").substring(0, 1000000)
}
