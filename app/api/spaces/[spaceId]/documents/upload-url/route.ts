import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"
import { z } from "zod"

export const maxDuration = 30

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".markdown"]

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(100),
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const rawParams = await params
    const spaceId = assertUUIDParam(rawParams.spaceId, "spaceId")
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const parsed = uploadUrlSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { filename, contentType, size } = parsed.data

    const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : ""
    if (!ext || !ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, Word (.docx), Text (.txt), Markdown (.md)." },
        { status: 400 },
      )
    }

    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
    const path = `spaces/${spaceId}/${uniqueName}`

    const { data: signed, error: signError } = await adminClient.storage
      .from("documents")
      .createSignedUploadUrl(path, { upsert: false })

    if (signError || !signed) {
      return NextResponse.json(
        { error: signError?.message ?? "Failed to create upload URL" },
        { status: 500 },
      )
    }

    return NextResponse.json({
      path,
      signedUrl: signed.signedUrl,
      token: signed.token,
      uniqueName,
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[SpaceUploadUrl] Unexpected error:", error)
    return NextResponse.json(
      { error: "An error occurred while creating the upload URL." },
      { status: 500 },
    )
  }
}
