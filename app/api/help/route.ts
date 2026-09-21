import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isHelpAiEnabled } from "@/lib/env"
import { completeLlm } from "@/lib/llm/complete"
import { HELP_REFUSAL_COPY_EN, shouldRefuseHelpQuery } from "@/lib/guidance/help-refuse"
import { HELP_SYSTEM_PROMPT, resolveGlossaryEntry } from "@/lib/guidance/help-corpus"
import { compileHelpAnswer, composeGlossaryHelp } from "@/lib/guidance/help-format"
import { isSpaceHelpAiDisabled, resolveHelpAiEnabled } from "@/lib/guidance/help-flag"
import { applyRateLimitHeaders, checkRateLimit, helpRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"

const payloadSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().nullish(),
  spaceId: z.string().uuid().nullish(),
  workspaceId: z.string().uuid().nullish(),
  section: z.string().max(40).nullish(),
  job: z.string().max(40).nullish(),
  pipeline: z.string().max(400).nullish(),
  documentTitles: z
    .array(
      z.object({
        title: z.string().max(200),
        role: z.string().max(80).nullable().optional(),
      }),
    )
    .max(40)
    .optional(),
  language: z.enum(["en", "nl"]).optional(),
})

function parseNavigate(text: string): string | null {
  const match = text.match(/NAVIGATE:\s*(\S+)/i)
  return match?.[1] ?? null
}

export async function POST(req: Request) {
  let rateLimitResult: RateLimitStatus | undefined
  const withRateLimit = (response: Response) => applyRateLimitHeaders(response, rateLimitResult)

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const rateLimitKey = user ? `help:user:${user.id}` : `help:ip:${identifier}`
    const currentRateLimit = await checkRateLimit(helpRateLimit, rateLimitKey)
    rateLimitResult = currentRateLimit

    if (!currentRateLimit.success) {
      return withRateLimit(
        NextResponse.json({ error: "Too many help requests. Please wait and try again." }, { status: 429 }),
      )
    }

    if (!user) {
      return withRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    if (!isHelpAiEnabled()) {
      return withRateLimit(NextResponse.json({ error: "Help AI is disabled", disabled: true }, { status: 503 }))
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return withRateLimit(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }))
    }

    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) {
      return withRateLimit(NextResponse.json({ error: "Invalid help request" }, { status: 400 }))
    }

    const input = parsed.data
    if (input.workspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("user_id", user.id)
        .maybeSingle()
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("space_id")
        .eq("id", input.workspaceId)
        .maybeSingle()
      const { data: spaceMember } = workspace?.space_id
        ? await supabase
            .from("space_members")
            .select("id")
            .eq("space_id", workspace.space_id)
            .eq("user_id", user.id)
            .maybeSingle()
        : { data: null }
      if (!member && !spaceMember) {
        return withRateLimit(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
      }
    }

    let spaceIdForHelp = input.spaceId ?? null
    if (!spaceIdForHelp && input.workspaceId) {
      const { data: workspaceForHelp } = await supabase
        .from("workspaces")
        .select("space_id")
        .eq("id", input.workspaceId)
        .maybeSingle()
      spaceIdForHelp = workspaceForHelp?.space_id ?? null
    }
    if (spaceIdForHelp) {
      const { data: helpSpace } = await supabase
        .from("spaces")
        .select("metadata")
        .eq("id", spaceIdForHelp)
        .maybeSingle()
      if (
        !resolveHelpAiEnabled({
          envEnabled: isHelpAiEnabled(),
          spaceHelpAiDisabled: isSpaceHelpAiDisabled(helpSpace?.metadata),
        })
      ) {
        return withRateLimit(NextResponse.json({ error: "Help AI is disabled", disabled: true }, { status: 503 }))
      }
    }

    const refused = shouldRefuseHelpQuery(input.message)
    const glossary = resolveGlossaryEntry(input.message)
    const helpLanguage = input.language === "nl" ? "nl" : "en"

    const admin = createAdminClient()
    let conversationId = input.conversationId
    if (!conversationId) {
      const { data: created, error } = await admin
        .from("help_conversations")
        .insert({
          user_id: user.id,
          space_id: input.spaceId ?? null,
          workspace_id: input.workspaceId ?? null,
        })
        .select("id")
        .single()
      if (error || !created) {
        return withRateLimit(NextResponse.json({ error: "Could not start help conversation" }, { status: 500 }))
      }
      conversationId = created.id
    }

    await admin.from("help_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: input.message,
      refused,
    })

    if (refused) {
      await admin.from("help_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: HELP_REFUSAL_COPY_EN,
        refused: true,
      })
      return withRateLimit(
        NextResponse.json({
          text: HELP_REFUSAL_COPY_EN,
          refused: true,
          conversationId,
        }),
      )
    }

    if (glossary) {
      const glossaryText = composeGlossaryHelp(glossary.key, glossary.definition, {
        documentTitles: input.documentTitles,
        language: helpLanguage,
        topic: glossary.key,
        question: input.message,
        section: input.section,
      })
      await admin.from("help_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: glossaryText,
        refused: false,
      })
      return withRateLimit(
        NextResponse.json({
          text: glossaryText,
          refused: false,
          conversationId,
          glossaryTerm: true,
        }),
      )
    }

    const titles = (input.documentTitles || [])
      .map((doc) => `${doc.title}${doc.role ? ` (${doc.role})` : ""}`)
      .join("; ")

    const contextBlock = [
      `UI language: ${input.language === "nl" ? "Dutch" : "English"}`,
      input.section ? `Current section: ${input.section}` : null,
      input.job ? `Job: ${input.job}` : null,
      input.pipeline ? `Pipeline: ${input.pipeline}` : null,
      input.workspaceId ? `Workspace id: ${input.workspaceId}` : null,
      titles ? `Bound document titles and roles only: ${titles}` : "No document titles provided.",
    ]
      .filter(Boolean)
      .join("\n")

    const { resolvePlatformTaskLlmWithFallback } = await import("@/lib/llm/resolve")
    let resolved
    try {
      resolved = await resolvePlatformTaskLlmWithFallback("help", "chat")
    } catch (error) {
      console.error("[Help API] Model resolution failed:", error)
      return withRateLimit(
        NextResponse.json({ error: "Help model is not configured" }, { status: 503 }),
      )
    }
    const helpPrompt = `${HELP_SYSTEM_PROMPT}\n\nCurrent screen: ${input.section || "unknown"}`

    const result = await completeLlm({
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
      endpoint: resolved.endpoint,
      messages: [
        { role: "system", content: helpPrompt },
        { role: "user", content: `${contextBlock}\n\nQuestion:\n${input.message}` },
      ],
      temperature: 0.2,
      maxTokens: 700,
      reasoningEffort: "low",
    })

    if (!result.text.trim()) {
      console.error("[Help API] Empty model response")
      return withRateLimit(
        NextResponse.json({ error: "Help could not answer" }, { status: 500 }),
      )
    }

    const formatted = compileHelpAnswer(result.text, {
      documentTitles: input.documentTitles,
      language: helpLanguage,
      question: input.message,
    })
    const navigate = parseNavigate(formatted)
    await admin.from("help_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: formatted,
      refused: false,
    })

    return withRateLimit(
      NextResponse.json({
        text: formatted,
        refused: false,
        conversationId,
        navigate,
      }),
    )
  } catch (error) {
    console.error("[Help API]", error)
    return withRateLimit(
      NextResponse.json({ error: "Help could not answer" }, { status: 500 }),
    )
  }
}
