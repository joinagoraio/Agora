import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { applyRateLimitHeaders, checkRateLimit, uploadRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { getClientIdentifier } from "@/lib/utils/request"
import { z } from "zod"

// Ensure route can complete before platform timeout (e.g. Vercel)
export const maxDuration = 30

const MAX_FILE_SIZE_BYTES = 9 * 1024 * 1024 // 9 MB for direct upload path
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".markdown"]

const uploadUrlSchema = z.object({
  workspaceId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().max(100),
  classification: z.enum(["public", "internal", "confidential"]).default("internal"),
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
})

export async function POST(req: NextRequest) {
  let rateLimitResult: RateLimitStatus | undefined
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const rateLimitKey = user ? `upload:user:${user.id}` : `upload:ip:${identifier}`
    const currentRateLimit = await checkRateLimit(uploadRateLimit, rateLimitKey)
    rateLimitResult = currentRateLimit
    const respondWithRateLimit = (res: NextResponse) =>
      applyRateLimitHeaders(res, rateLimitResult)

    if (!currentRateLimit.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Upload rate limit exceeded. Please wait and try again." }, { status: 429 }),
      )
    }

    if (!user) {
      return respondWithRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const body = await req.json()
    const parsed = uploadUrlSchema.safeParse(body)
    if (!parsed.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 }),
      )
    }

    const { workspaceId, filename, contentType, classification, size } = parsed.data

    const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : ""
    if (!ext || !ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Invalid file type. Allowed: PDF, Word (.docx), Text (.txt), Markdown (.md)." }, { status: 400 }),
      )
    }

    try {
      await requireAuthAndPermission("workspace_item:create", { workspaceId })
    } catch {
      return respondWithRateLimit(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    }

    const adminClient = createAdminClient()
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .single()

    if (!workspace) {
      return respondWithRateLimit(NextResponse.json({ error: "Workspace not found" }, { status: 404 }))
    }

    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
    const path = `workspaces/${workspaceId}/${uniqueName}`

    const { data: signed, error: signError } = await adminClient.storage
      .from("documents")
      .createSignedUploadUrl(path, { upsert: false })

    if (signError || !signed) {
      return respondWithRateLimit(
        NextResponse.json({ error: signError?.message ?? "Failed to create upload URL" }, { status: 500 }),
      )
    }

    return respondWithRateLimit(
      NextResponse.json({
        path,
        signedUrl: signed.signedUrl,
        token: signed.token,
        uniqueName,
      }),
    )
  } catch (e) {
    return NextResponse.json(
      { error: "An error occurred while creating the upload URL." },
      { status: 500 },
    )
  }
}
