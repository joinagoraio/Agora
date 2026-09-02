import { NextResponse } from "next/server"
import { z } from "zod"

import { compileSystemPrompt } from "@/lib/chat/playbook-compiler"
import { env } from "@/lib/env"
import { completeLlm } from "@/lib/llm/complete"
import { applyRateLimitHeaders, chatRateLimit, checkRateLimit, type RateLimitStatus } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getClientIdentifier } from "@/lib/utils/request"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export const runtime = "nodejs"
export const maxDuration = 60

const payloadSchema = z.object({
  message: z.string().min(1).max(8000),
  itemId: z.string().uuid().optional(),
  language: z.enum(["en", "nl"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(16000),
      }),
    )
    .max(20)
    .optional(),
})

type SpaceDoc = {
  id: string
  title: string
  text: string
}

function clip(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…`
}

function buildLibraryContext(docs: SpaceDoc[], focusId?: string) {
  const focused = docs.find((doc) => doc.id === focusId)
  const others = docs.filter((doc) => doc.id !== focusId)
  const parts: string[] = []

  if (focused) {
    parts.push(`OPEN DOCUMENT (${focused.title}, id ${focused.id}):\n${clip(focused.text, 24000)}`)
  }

  for (const doc of others.slice(0, 12)) {
    parts.push(`LIBRARY DOCUMENT (${doc.title}, id ${doc.id}):\n${clip(doc.text, 4000)}`)
  }

  return parts.join("\n\n").slice(0, 60000)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  let rateLimitResult: RateLimitStatus | undefined
  const withRateLimit = (response: Response) => applyRateLimitHeaders(response, rateLimitResult)

  try {
    const spaceId = assertUUIDParam((await params).spaceId, "spaceId")
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const currentRateLimit = await checkRateLimit(chatRateLimit, user ? `space-ask:${user.id}` : `space-ask:${identifier}`)
    rateLimitResult = currentRateLimit

    if (!currentRateLimit.success) {
      return withRateLimit(NextResponse.json({ error: "Too many questions. Please wait and try again." }, { status: 429 }))
    }

    if (!user) {
      return withRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    if (!env.OPENAI_API_KEY) {
      return withRateLimit(NextResponse.json({ error: "Ask is not available." }, { status: 503 }))
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return withRateLimit(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }))
    }

    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) {
      return withRateLimit(NextResponse.json({ error: "Invalid request" }, { status: 400 }))
    }

    const adminClient = createAdminClient()
    const { data: membership } = await adminClient
      .from("space_members")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!membership) {
      return withRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const { data: space } = await adminClient.from("spaces").select("name").eq("id", spaceId).maybeSingle()
    const { data: items } = await adminClient
      .from("space_items")
      .select("id, payload")
      .eq("space_id", spaceId)
      .eq("item_type", "document")
      .order("created_at", { ascending: false })

    const docs: SpaceDoc[] = (items ?? []).map((item) => {
      const payloadRecord = (item.payload ?? {}) as {
        title?: string
        file_name?: string
        full_text?: string
        summary?: string
      }
      return {
        id: item.id,
        title: (payloadRecord.title || payloadRecord.file_name || "Untitled").trim(),
        text: (payloadRecord.full_text || payloadRecord.summary || "").trim() || "(No extracted text.)",
      }
    })

    if (docs.length === 0) {
      return withRateLimit(
        NextResponse.json({
          text: "There are no shared-library documents to ask about yet.",
        }),
      )
    }

    const library = buildLibraryContext(docs, parsed.data.itemId)
    const compiled = compileSystemPrompt({
      kind: "chat",
      userLanguage: parsed.data.language === "nl" ? "Dutch" : "English",
      isDocumentPreview: Boolean(parsed.data.itemId),
      runtimeSections: [
        `Authority: ${space?.name ?? "this authority"}.`,
        "The user is reading the shared library, not a programme. Answer from these documents only. Do not draft programme chapters or measures.",
        library,
      ].join("\n\n"),
    })

    const history = (parsed.data.history ?? []).slice(-12)
    const result = await completeLlm({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: compiled.systemPrompt },
        ...history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: parsed.data.message },
      ],
      temperature: 0.2,
      maxTokens: 1200,
    })

    return withRateLimit(NextResponse.json({ text: result.text }))
  } catch (error) {
    if (error instanceof ValidationError) {
      return withRateLimit(NextResponse.json({ error: error.message }, { status: 400 }))
    }
    console.error("[space-ask]", error)
    return withRateLimit(NextResponse.json({ error: "Could not answer that question." }, { status: 500 }))
  }
}
