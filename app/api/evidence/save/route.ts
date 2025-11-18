import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { saveEvidenceToWorkspace } from "@/lib/actions/workspace-item"
import { getConversation } from "@/lib/actions/conversation"
import { applyRateLimitHeaders, checkRateLimit, evidenceRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"

export async function POST(req: NextRequest) {
  let rateLimitStatus: RateLimitStatus | undefined
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const identifier = user?.id ?? getClientIdentifier(req.headers)
    rateLimitStatus = await checkRateLimit(
      evidenceRateLimit,
      user ? `evidence-save:user:${user.id}` : `evidence-save:ip:${identifier}`,
    )
    const respondWithRateLimit = (response: NextResponse) => applyRateLimitHeaders(response, rateLimitStatus)

    if (!rateLimitStatus.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Evidence save rate limit exceeded. Please wait and try again." }, { status: 429 }),
      )
    }

    const body = await req.json()
    const { workspaceId, question, answer, citations, confidence, conversationId } = body

    if (!workspaceId || !question || !answer || !citations || !confidence) {
      return respondWithRateLimit(NextResponse.json({ error: "Missing required fields" }, { status: 400 }))
    }

    if (!user) {
      return respondWithRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    // Fetch conversation title if conversationId is provided
    let conversationTitle: string | undefined = undefined
    if (conversationId) {
      const conversationResult = await getConversation(conversationId)
      if (conversationResult.data) {
        conversationTitle = conversationResult.data.title || undefined
      }
    }

    const { data, error } = await saveEvidenceToWorkspace(workspaceId, {
      question,
      answer,
      citations,
      confidence,
      conversationId: conversationId || undefined,
      conversationTitle,
    })

    if (error) {
      return respondWithRateLimit(NextResponse.json({ error }, { status: 400 }))
    }

    return respondWithRateLimit(NextResponse.json({ data }, { status: 201 }))
  } catch (error) {
    console.error("[v0] Evidence save API error:", error)
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
      rateLimitStatus,
    )
  }
}
