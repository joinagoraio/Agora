import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

import { storagePathFromUrl } from "@/lib/utils/space-storage"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string; itemId: string }> },
) {
  try {
    const raw = await params
    const spaceId = assertUUIDParam(raw.spaceId, "spaceId")
    const itemId = assertUUIDParam(raw.itemId, "itemId")

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: membership } = await adminClient
      .from("space_members")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: item } = await adminClient
      .from("space_items")
      .select("id, payload, source_url")
      .eq("id", itemId)
      .eq("space_id", spaceId)
      .maybeSingle()

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const payload = (item.payload ?? {}) as { file_url?: string; mime_type?: string; file_name?: string }
    const fileUrl = payload.file_url || item.source_url
    if (!fileUrl) {
      return NextResponse.json({ error: "No file" }, { status: 404 })
    }

    const storagePath = storagePathFromUrl(fileUrl, spaceId)
    if (!storagePath) {
      return NextResponse.redirect(fileUrl)
    }

    const { data: blob, error } = await adminClient.storage.from("documents").download(storagePath)
    if (error || !blob) {
      return NextResponse.json({ error: "File not available" }, { status: 404 })
    }

    const filename = payload.file_name || storagePath.split("/").pop() || "document"
    const contentType = payload.mime_type || blob.type || "application/octet-stream"

    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 })
  }
}
